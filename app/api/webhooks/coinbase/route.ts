import { NextRequest } from "next/server";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@/db";
import { payments, subscriptions, subscriptionPlans } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { validateCoinbasePrice } from "@/lib/billing/validation";

// Types for Coinbase Commerce Webhook Events
interface CoinbaseEvent {
  id: string;
  resource: "event";
  type: string;
  api_version: string;
  created_at: string;
  data: {
    id: string;
    code: string;
    name: string;
    description: string;
    hosted_url: string;
    created_at: string;
    expires_at: string;
    metadata: Record<string, unknown>;
    pricing: {
      local: { amount: string; currency: string };
    };
    payments: Array<{
      status: string;
      value: { local: { amount: string; currency: string }; crypto: { amount: string; currency: string } };
    }>;
  };
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("x-cc-webhook-signature");

  if (!sig) {
    return new Response("Missing Coinbase signature", { status: 400 });
  }

  const rawBody = await req.text();

  // Verify webhook signature using HMAC SHA256
  const hmac = crypto.createHmac("sha256", env.COINBASE_COMMERCE_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const computedSignature = hmac.digest("hex");

  // Use timingSafeEqual to prevent timing attacks
  const sigBuffer = Buffer.from(sig, 'utf8');
  const computedSigBuffer = Buffer.from(computedSignature, 'utf8');

  if (sigBuffer.length !== computedSigBuffer.length || !crypto.timingSafeEqual(sigBuffer, computedSigBuffer)) {
    console.error("Coinbase Commerce webhook verification failed: signature mismatch");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: CoinbaseEvent;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    logger.error("Coinbase Commerce webhook: invalid JSON", { error: err });
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    if (event.type === "charge:confirmed") {
      await handleChargeConfirmed(event);
    } else if (event.type === "charge:resolved") {
      await handleChargeResolved(event);
    } else if (event.type === "charge:failed") {
      await handleChargeFailed(event);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    logger.error("Error processing Coinbase Commerce webhook", { error });
    return new Response("Webhook handler error", { status: 500 });
  }
}

async function handleChargeConfirmed(event: CoinbaseEvent) {
  const charge = event.data;
  
  // Idempotency check: if we've already processed this charge as succeeded, skip
  const existingConfirmedPayment = await db.query.payments.findFirst({
    where: (payments, { eq, and }) => 
      and(
        eq(payments.coinbaseChargeId, charge.id),
        eq(payments.status, "succeeded")
      ),
  });

  if (existingConfirmedPayment) {
    logger.info(`Coinbase charge already processed`, { chargeId: charge.id });
    return;
  }

  const metadata = charge.metadata || {};
  const userId = metadata.userId as string | undefined;
  const planId = metadata.planId as string | undefined;
  // Default to 'month' if not specified, but it should be there from charge creation
  const interval = (metadata.interval as "month" | "year") || "month";

  if (!userId || !planId) {
    console.warn("Coinbase charge missing userId or planId metadata");
    return;
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId));

  if (!plan) {
    logger.warn("Plan not found for Coinbase charge", { planId });
    return;
  }

  // Amount in USD from local pricing
  const localPrice = charge.pricing?.local;

  if (!localPrice || localPrice.currency !== "USD") {
    console.warn("Unexpected Coinbase local price:", localPrice);
    return;
  }

  const amountUsd = parseFloat(localPrice.amount);
  const amountUsdCents = Math.round(amountUsd * 100);

  // Amount Validation
  const validation = validateCoinbasePrice(planId, interval, amountUsdCents);
  
  if (!validation.isValid) {
     logger.error("Coinbase charge amount mismatch", { 
       chargeId: charge.id, 
       paid: amountUsdCents, 
       expected: validation.expected,
       error: validation.error
     });
     
     // Fail safely if it's a significant mismatch (>1 USD) or explicit error
     if (validation.error === "Unknown plan" || Math.abs(amountUsdCents - validation.expected) > 100) {
        return; 
     }
  }

  // Use a transaction to ensure atomicity
  await db.transaction(async (tx) => {
    // 1. Update or create payment record
    const existingPayment = await tx.query.payments.findFirst({
      where: (payments, { eq }) => eq(payments.coinbaseChargeId, charge.id),
    });

    if (existingPayment) {
      await tx
        .update(payments)
        .set({
          status: "succeeded",
          paidAt: new Date(),
          amountUsdCents,
          amountOriginal: amountUsdCents,
        })
        .where(eq(payments.id, existingPayment.id));
    } else {
      await tx.insert(payments).values({
        id: nanoid(),
        userId,
        planId: plan.id,
        provider: "coinbase_commerce",
        status: "succeeded",
        amountUsdCents,
        amountOriginal: amountUsdCents,
        currency: "USD",
        coinbaseChargeId: charge.id,
        description: `Coinbase Commerce payment for ${plan.name}`,
        paidAt: new Date(),
        // Link to subscription will be added below if created
      });
    }

    // 2. Handle Subscription
    // Check if user already has an active subscription for this plan (unlikely for new checkout, but possible)
    // Or if we need to create a new one.
    // Logic: If there is no active subscription for this user, create one.
    // If there is an existing one that is canceled/expired, create a new one.
    
    // Calculate period dates
    const startDate = new Date();
    const endDate = new Date(startDate);
    if (interval === "year") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const newSubscriptionId = nanoid();

    await tx.insert(subscriptions).values({
      id: newSubscriptionId,
      userId,
      planId: plan.id,
      status: "active",
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      metadata: {
        provider: "coinbase_commerce",
        chargeId: charge.id,
        interval,
      },
    });

    // 3. Link payment to subscription
    // If we just created the payment (implied by !existingPayment or even if we updated it), 
    // we should make sure it points to this new subscription.
    // However, if the payment was already created in the action, it might not have subscriptionId yet.
    
    await tx
      .update(payments)
      .set({ subscriptionId: newSubscriptionId })
      .where(eq(payments.coinbaseChargeId, charge.id));
  });
}

async function handleChargeResolved(event: CoinbaseEvent) {
  // Resolved means a payment was detected (e.g. late, underpaid, overpaid) and the merchant resolved it.
  // We treat this similarly to confirmed, assuming the merchant manually approved it.
  logger.info("Handling resolved Coinbase charge", { chargeId: event.data.id });
  await handleChargeConfirmed(event);
}

async function handleChargeFailed(event: CoinbaseEvent) {
  logger.warn("Coinbase charge failed", { chargeId: event.data.id });
  // Could update status to 'failed' if a record existed
  const charge = event.data;
  await db
      .update(payments)
      .set({ status: "failed", failedAt: new Date() })
      .where(eq(payments.coinbaseChargeId, charge.id));
}


