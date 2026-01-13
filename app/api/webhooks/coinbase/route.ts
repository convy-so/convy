import { NextRequest } from "next/server";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@/db";
import { payments, subscriptions, subscriptionPlans } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { validateCoinbasePrice } from "@/lib/billing/validation";
import { PLAN_PRICES_USD_CENTS } from "@/lib/billing/types";

/**
 * ✅ FIX: Helper to add months/years to a date, handling month-end overflow correctly
 */
function addPeriodToDate(date: Date, interval: "month" | "year"): Date {
  const result = new Date(date);
  if (interval === "year") {
    result.setFullYear(result.getFullYear() + 1);
  } else {
    // Handle month overflow (e.g., Jan 31 + 1 month = Feb 28/29, not March 3)
    const originalDate = result.getDate();
    result.setMonth(result.getMonth() + 1);
    // If date overflowed (e.g., Feb 31 -> March 3), set to last day of target month
    if (result.getDate() !== originalDate) {
      result.setDate(0); // Set to last day of previous month (which is the target month)
    }
  }
  return result;
}

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

  // ✅ FIX: Use timingSafeEqual without length check to prevent timing attacks
  // Coinbase sends signature as hex string
  let sigBuffer: Buffer;
  try {
    sigBuffer = Buffer.from(sig, 'hex');
  } catch {
    // Fallback to utf8 if not hex
    sigBuffer = Buffer.from(sig, 'utf8');
  }
  const computedSigBuffer = Buffer.from(computedSignature, 'hex');

  // Ensure both buffers are same length (pad if needed) for constant-time comparison
  const maxLength = Math.max(sigBuffer.length, computedSigBuffer.length);
  const paddedSig = Buffer.alloc(maxLength);
  const paddedComputed = Buffer.alloc(maxLength);
  sigBuffer.copy(paddedSig, 0);
  computedSigBuffer.copy(paddedComputed, 0);

  if (!crypto.timingSafeEqual(paddedSig, paddedComputed)) {
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
    } else if (event.type === "charge:refunded") {
      await handleChargeRefunded(event);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    logger.error("Error processing Coinbase Commerce webhook", { error });
    return new Response("Webhook handler error", { status: 500 });
  }
}

async function handleChargeConfirmed(event: CoinbaseEvent) {
  const charge = event.data;
  
  // ✅ FIX: Check idempotency BEFORE transaction
  const existingConfirmedPayment = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.coinbaseChargeId, charge.id),
        eq(payments.status, "succeeded")
      )
    )
    .limit(1);

  if (existingConfirmedPayment.length > 0) {
    logger.info(`Coinbase charge already processed`, { chargeId: charge.id });
    return;
  }

  // ✅ FIX: Check charge expiration
  const expiresAt = new Date(charge.expires_at);
  if (expiresAt < new Date()) {
    logger.warn("Coinbase charge expired", { chargeId: charge.id, expiresAt });
    return;
  }

  const metadata = charge.metadata || {};
  const userId = metadata.userId as string | undefined;
  const planId = metadata.planId as string | undefined;
  // Default to 'month' if not specified, but it should be there from charge creation
  const interval = (metadata.interval as "month" | "year") || "month";

  if (!userId || !planId) {
    logger.warn("Coinbase charge missing userId or planId metadata", { chargeId: charge.id });
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
    logger.warn("Unexpected Coinbase local price", { chargeId: charge.id, localPrice });
    return;
  }

  const amountUsd = parseFloat(localPrice.amount);
  const amountUsdCents = Math.round(amountUsd * 100);

  // ✅ FIX: Strict amount validation - must be exact match (or max 1 cent tolerance)
  const validation = await validateCoinbasePrice(planId, interval, amountUsdCents);
  
  if (!validation.isValid) {
     logger.error("Coinbase charge amount mismatch", { 
       chargeId: charge.id, 
       paid: amountUsdCents, 
       expected: validation.expected,
       error: validation.error
     });
     // ✅ FIX: Reject if amount is below required or significantly above
     return; // Don't process if amount doesn't match
  }

  // ✅ FIX: Extract crypto amount from payments array
  const cryptoPayment = charge.payments?.find(p => p.status === "COMPLETED");
  const cryptoAmount = cryptoPayment?.value?.crypto?.amount;
  const cryptoCurrency = cryptoPayment?.value?.crypto?.currency;

  // Use a transaction to ensure atomicity
  await db.transaction(async (tx) => {
    // 1. Update or create payment record
    const existingPayment = await tx.query.payments.findFirst({
      where: (payments, { eq }) => eq(payments.coinbaseChargeId, charge.id),
    });

    if (existingPayment) {
      // ✅ FIX: Store crypto amount when updating existing payment
      await tx
        .update(payments)
        .set({
          status: "succeeded",
          paidAt: new Date(),
          amountUsdCents,
          amountOriginal: amountUsdCents,
          cryptoCurrency: cryptoCurrency as any,
          cryptoAmount: cryptoAmount ?? null,
        })
        .where(eq(payments.id, existingPayment.id));
    } else {
      // ✅ FIX: Store crypto amount and currency
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
        cryptoCurrency: cryptoCurrency as any,
        cryptoAmount: cryptoAmount ?? null,
        description: `Coinbase Commerce payment for ${plan.name}`,
        paidAt: new Date(),
      });
    }

    // 2. Handle Subscription - Check for existing active subscription
    const existingSubscription = await tx.query.subscriptions.findFirst({
      where: (s, { eq, and, gte }) => and(
        eq(s.userId, userId),
        eq(s.status, "active"),
        gte(s.currentPeriodEnd, new Date())
      ),
    });

    let targetSubscriptionId: string;

    if (existingSubscription) {
      // Renewal or upgrade/downgrade scenario
      const existingMetadata = (existingSubscription.metadata as Record<string, unknown>) || {};
      
      // Check if this is the same plan (renewal) or different plan (upgrade/downgrade)
      const isSamePlan = existingSubscription.planId === plan.id;
      
      if (isSamePlan) {
        // ✅ FIX: Renewal: Extend the current period using proper date calculation
        const newEndDate = addPeriodToDate(existingSubscription.currentPeriodEnd, interval);
        
        await tx.update(subscriptions)
          .set({ 
            currentPeriodEnd: newEndDate,
            cancelAtPeriodEnd: false, // Clear any pending cancellation
            metadata: {
              ...existingMetadata,
              provider: "coinbase_commerce",
              lastChargeId: charge.id,
              interval,
              lastRenewalAt: new Date().toISOString(),
            }
          })
          .where(eq(subscriptions.id, existingSubscription.id));
        
        targetSubscriptionId = existingSubscription.id;
        
        logger.info("Coinbase subscription renewed", { 
          subscriptionId: existingSubscription.id, 
          newEndDate: newEndDate.toISOString() 
        });
      } else {
        // ✅ FIX: Plan change (upgrade/downgrade): Calculate proration
        const now = new Date();
        const remainingMs = existingSubscription.currentPeriodEnd.getTime() - now.getTime();
        const totalMs = existingSubscription.currentPeriodEnd.getTime() - existingSubscription.currentPeriodStart.getTime();
        const remainingRatio = remainingMs / totalMs;

        // Get old plan price
        const oldPlanPrice = PLAN_PRICES_USD_CENTS[existingSubscription.planId as keyof typeof PLAN_PRICES_USD_CENTS];
        const oldMonthlyPrice = oldPlanPrice?.monthly ?? 0;
        
        // Calculate credit for remaining time
        const creditCents = Math.round(oldMonthlyPrice * remainingRatio);
        
        // New plan price
        const newPlanPrice = PLAN_PRICES_USD_CENTS[plan.id as keyof typeof PLAN_PRICES_USD_CENTS];
        const newMonthlyPrice = newPlanPrice?.monthly ?? 0;
        
        // Expected charge amount (new plan price - credit)
        const expectedCharge = Math.max(0, newMonthlyPrice - creditCents);
        
        // Verify amount matches prorated charge
        if (Math.abs(amountUsdCents - expectedCharge) > 1) {
          logger.error("Coinbase plan change: amount doesn't match prorated charge", {
            chargeId: charge.id,
            paid: amountUsdCents,
            expected: expectedCharge,
            oldPlanPrice: oldMonthlyPrice,
            newPlanPrice: newMonthlyPrice,
            credit: creditCents,
            remainingRatio,
          });
          // Continue anyway, but log for review
        }

        // Plan change: Update plan and reset period
        const startDate = now;
        const endDate = addPeriodToDate(startDate, interval);
        
        await tx.update(subscriptions)
          .set({ 
            planId: plan.id,
            currentPeriodStart: startDate,
            currentPeriodEnd: endDate,
            cancelAtPeriodEnd: false,
            metadata: {
              ...existingMetadata,
              provider: "coinbase_commerce",
              lastChargeId: charge.id,
              interval,
              previousPlanId: existingSubscription.planId,
              planChangedAt: new Date().toISOString(),
              prorationCredit: creditCents,
              prorationCharge: amountUsdCents,
            }
          })
          .where(eq(subscriptions.id, existingSubscription.id));
        
        targetSubscriptionId = existingSubscription.id;
        
        logger.info("Coinbase subscription plan changed", { 
          subscriptionId: existingSubscription.id, 
          fromPlan: existingSubscription.planId,
          toPlan: plan.id,
          prorationCredit: creditCents,
          prorationCharge: amountUsdCents,
        });
      }
    } else {
      // ✅ FIX: New subscription: Use proper date calculation
      const startDate = new Date();
      const endDate = addPeriodToDate(startDate, interval);

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
      
      targetSubscriptionId = newSubscriptionId;
      
      logger.info("New Coinbase subscription created", { 
        subscriptionId: newSubscriptionId 
      });
    }

    // 3. Link payment to subscription
    await tx
      .update(payments)
      .set({ subscriptionId: targetSubscriptionId })
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

async function handleChargeRefunded(event: CoinbaseEvent) {
  const charge = event.data;
  
  logger.info("Handling refunded Coinbase charge", { chargeId: charge.id });

  // Use a transaction to ensure atomicity
  await db.transaction(async (tx) => {
    // 1. Find the payment
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.coinbaseChargeId, charge.id))
      .limit(1);

    if (!payment) {
      logger.warn("Payment not found for Coinbase refund", { chargeId: charge.id });
      return;
    }

    // 2. Mark payment as failed/refunded
    await tx
      .update(payments)
      .set({ status: "failed" }) 
      .where(eq(payments.id, payment.id));

    // 3. Cancel subscription if applicable
    if (payment.subscriptionId) {
      await tx
        .update(subscriptions)
        .set({
          status: "canceled",
          canceledAt: new Date(),
        })
        .where(eq(subscriptions.id, payment.subscriptionId));
      
      logger.info("Subscription canceled due to Coinbase refund", { 
        subscriptionId: payment.subscriptionId,
        paymentId: payment.id 
      });
    }
  });
}


