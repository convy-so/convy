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

// Types for Coinbase Business Payment Link Webhook Events
interface CoinbasePaymentLinkEvent {
  id: string;
  resource: "event";
  type: string;
  api_version: string;
  created_at: string;
  data: {
    // Structure for Business Payment Link events
    payment_link_id: string;
    payment_id: string;
    status: "COMPLETED" | "PENDING" | "FAILED";
    metadata: Record<string, unknown>;
    amount: {
      amount: string;
      currency: string;
    };
    // Crypto details if available
    payment_details?: {
      network: string;
      transaction_id: string;
      amount_crypto: {
         amount: string;
         currency: string;
      }
    };
  };
}
// Webhook verification behaves like the legacy Commerce API, using X-CC-WEBHOOK-SIGNATURE
export async function POST(req: NextRequest) {
  const sig = req.headers.get("x-cc-webhook-signature");
  
  if (!sig) {
    return new Response("Missing Coinbase signature", { status: 400 });
  }

  const rawBody = await req.text();

  // Verify webhook signature using HMAC SHA256 (standard for Commerce/Payment Link webhooks)
  const hmac = crypto.createHmac("sha256", env.COINBASE_COMMERCE_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const computedSignature = hmac.digest("hex");

  const sigBuffer = Buffer.from(sig, 'hex'); // Assuming hex
  const computedSigBuffer = Buffer.from(computedSignature, 'hex');

  // ✅ FIX: Strict Security Check avoids timing attacks via length leaks
  if (sigBuffer.length !== computedSigBuffer.length) {
    logger.error("Coinbase webhook signature length mismatch");
    return new Response("Invalid signature", { status: 400 });
  }

  if (!crypto.timingSafeEqual(sigBuffer, computedSigBuffer)) {
    logger.error("Coinbase webhook signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: CoinbasePaymentLinkEvent;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    logger.error("Coinbase webhook: invalid JSON", { error: err });
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    // New Event Type for Payment Links
    if (event.type === "payment_link.payment.success") {
      await handlePaymentSuccess(event);
    } else if (event.type === "payment_link.payment.failed") {
      await handlePaymentFailed(event);
    } 
    // We ignore other events

    return new Response("OK", { status: 200 });
  } catch (error) {
    logger.error("Error processing Coinbase webhook", { error });
    return new Response("Webhook handler error", { status: 500 });
  }
}

async function handlePaymentSuccess(event: CoinbasePaymentLinkEvent) {
  const data = event.data;
  const metadata = data.metadata || {};
  const paymentId = metadata.paymentId as string | undefined;

  logger.info("Processing Coinbase payment success", { 
    paymentLinkId: data.payment_link_id, 
    paymentId 
  });

  if (!paymentId) {
    logger.error("Coinbase event missing paymentId metadata", { eventId: event.id });
    return;
  }

  // 1. Idempotency Check
  const existingPayment = await db.query.payments.findFirst({
    where: (p, { eq }) => eq(p.id, paymentId),
  });

  if (!existingPayment) {
     logger.error("Payment record not found for completion", { paymentId });
     return;
  }

  if (existingPayment.status === "succeeded") {
    logger.info("Payment already confirmed (idempotent)", { paymentId });
    return;
  }

  const userId = metadata.userId as string | undefined;
  const planId = metadata.planId as string | undefined;
  const interval = (metadata.interval as "month" | "year") || "month";

  if (!userId || !planId) {
    logger.warn("Coinbase event missing userId or planId metadata", { paymentId });
    return;
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId));

  if (!plan) {
    logger.warn("Plan not found", { planId });
    return;
  }

  // 3. Amount Validation
  const amountPaid = parseFloat(data.amount.amount);
  const amountPaidCents = Math.round(amountPaid * 100);

  // Validate amount
  const validation = await validateCoinbasePrice(planId, interval, amountPaidCents);
  
  if (!validation.isValid) {
     logger.error("Coinbase payment amount mismatch", { 
       paymentId, 
       paid: amountPaidCents, 
       expected: validation.expected 
     });
     return;
  }

  // 4. Extract crypto details if available
  const cryptoDetails = data.payment_details;
  const cryptoAmount = cryptoDetails?.amount_crypto?.amount;
  const cryptoCurrency = cryptoDetails?.amount_crypto?.currency;

  // 5. Transaction: Update Payment & Subscription
  await db.transaction(async (tx) => {
    // Update Payment
    await tx
      .update(payments)
      .set({
        status: "succeeded",
        paidAt: new Date(),
        amountUsdCents: amountPaidCents,
        amountOriginal: amountPaidCents,
        cryptoCurrency: cryptoCurrency as any,
        cryptoAmount: cryptoAmount ?? null,
        // We might want to store the transaction hash or specific payment ID from Coinbase if needed
        // But we rely on our 'paymentId' as the primary key.
      })
      .where(eq(payments.id, paymentId));

    // Handle Subscription Logic (Renewal / New / Upgrade)
    const existingSubscription = await tx.query.subscriptions.findFirst({
      where: (s, { eq, and, gte }) => and(
        eq(s.userId, userId),
        eq(s.status, "active"),
        gte(s.currentPeriodEnd, new Date())
      ),
    });

    let targetSubscriptionId: string;

    if (existingSubscription) {
      // Logic for existing subscription (Renewal / Change)
      // ... (Reusing existing robust logic) ...
      const existingMetadata = (existingSubscription.metadata as Record<string, unknown>) || {};
      const isSamePlan = existingSubscription.planId === plan.id;
      
      if (isSamePlan) {
        // Renewal
        const newEndDate = addPeriodToDate(existingSubscription.currentPeriodEnd, interval);
        await tx.update(subscriptions)
          .set({ 
            currentPeriodEnd: newEndDate,
            cancelAtPeriodEnd: false,
            metadata: {
              ...existingMetadata,
              provider: "coinbase_business", // Updated provider name
              lastPaymentId: paymentId,
              interval,
              lastRenewalAt: new Date().toISOString(),
            }
          })
          .where(eq(subscriptions.id, existingSubscription.id));
        targetSubscriptionId = existingSubscription.id;
      } else {
         // Plan Change
         const now = new Date();
         // Calculate proration credit (simplified)
         const oldPlanPrice = PLAN_PRICES_USD_CENTS[existingSubscription.planId as keyof typeof PLAN_PRICES_USD_CENTS];
         const oldMonthlyPrice = oldPlanPrice?.monthly ?? 0;
         
         const remainingMs = existingSubscription.currentPeriodEnd.getTime() - now.getTime();
         const totalMs = existingSubscription.currentPeriodEnd.getTime() - existingSubscription.currentPeriodStart.getTime();
         const remainingRatio = Math.max(0, remainingMs / totalMs); // prevent negative
         
         const creditCents = Math.round(oldMonthlyPrice * remainingRatio);
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
              provider: "coinbase_business",
              lastPaymentId: paymentId,
              interval,
              previousPlanId: existingSubscription.planId,
              planChangedAt: new Date().toISOString(),
              prorationCredit: creditCents,
            }
          })
          .where(eq(subscriptions.id, existingSubscription.id));
         targetSubscriptionId = existingSubscription.id;
      }
    } else {
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
          provider: "coinbase_business",
          initialPaymentId: paymentId,
          interval,
        },
      });
      targetSubscriptionId = newSubscriptionId;
    }

    // Link payment
    await tx
      .update(payments)
      .set({ subscriptionId: targetSubscriptionId })
      .where(eq(payments.id, paymentId));
  });
}

async function handlePaymentFailed(event: CoinbasePaymentLinkEvent) {
  const metadata = event.data.metadata || {};
  const paymentId = metadata.paymentId as string | undefined;
  
  if (paymentId) {
    logger.warn("Coinbase payment failed", { paymentId });
    await db
      .update(payments)
      .set({ status: "failed", failedAt: new Date() })
      .where(eq(payments.id, paymentId));
  }
}