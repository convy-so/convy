import { NextRequest } from "next/server";
import Stripe from "stripe";

import { db } from "@/db";
import {
  payments,
  subscriptions,
  subscriptionPlans,
} from "@/db/schema";
import { env } from "@/lib/env";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { PLAN_PRICES_USD_CENTS } from "@/lib/billing/types";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return new Response("Missing Stripe signature", { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.error("Stripe webhook signature verification failed", { error: err });
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }
      case "customer.subscription.deleted":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(charge);
        break;
      }
      default:
        logger.debug(`Unhandled Stripe event type: ${event.type}`);
        break;
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    logger.error("Error processing Stripe webhook", { error });
    return new Response("Webhook handler error", { status: 500 });
  }
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  if (!session.subscription || !session.customer) return;

  const metadata = session.metadata ?? {};
  const planId = metadata.planId;
  const userId = metadata.userId;

  if (!planId || !userId) {
    console.warn(
      "checkout.session.completed missing planId or userId metadata"
    );
    return;
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId));

  if (!plan) {
    logger.warn("Plan not found for Stripe checkout", { planId });
    return;
  }

  const stripeSubId = session.subscription.toString();
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  // ✅ FIX: Check idempotency BEFORE creating subscription
  const [existingSubscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));

  if (existingSubscription) {
    logger.info("Subscription already exists, skipping duplicate webhook", {
      stripeSubId,
      subscriptionId: existingSubscription.id,
    });
    return; // Already processed
  }

  const now = new Date();

  // Stripe will send a follow-up invoice.payment_succeeded with exact amounts,
  // here we just ensure we have a subscription record linked to Stripe.
  await db
    .insert(subscriptions)
    .values({
      id: stripeSubId,
      userId,
      planId: plan.id,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: now, // will be updated on invoice webhook
      stripeSubscriptionId: stripeSubId,
      stripeCustomerId: stripeCustomerId ?? null,
    });
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  if (!invoice.subscription || !invoice.customer) return;

  const stripeSubId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription.id;

  const amountPaid = invoice.amount_paid ?? 0;

  // Use account default currency (assumed USD) for canonical storage
  const currency = (invoice.currency ?? "usd").toUpperCase();

  const periodStart = invoice.lines.data[0]?.period?.start;
  const periodEnd = invoice.lines.data[0]?.period?.end;

  if (!periodStart || !periodEnd) return;

  // ✅ FIX: Use transaction to ensure atomicity
  await db.transaction(async (tx) => {
    // ✅ FIX: Check for existing payment (idempotency)
    const paymentIntentId = invoice.payment_intent?.toString();
    if (paymentIntentId) {
      const [existingPayment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.stripePaymentIntentId, paymentIntentId));

      if (existingPayment) {
        logger.info("Payment already recorded, skipping duplicate webhook", {
          paymentIntentId,
          paymentId: existingPayment.id,
        });
        return; // Already processed
      }
    }

    // ✅ FIX: Create subscription if it doesn't exist (race condition fix)
    let [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));

    if (!sub) {
      // Subscription might not exist yet if checkout.session.completed hasn't fired
      // Extract planId from invoice metadata or line items
      const planId = invoice.metadata?.planId || invoice.lines.data[0]?.price?.metadata?.planId;
      const userId = invoice.metadata?.userId;

      if (!planId || !userId) {
        logger.error("Cannot create subscription: missing planId or userId", {
          invoiceId: invoice.id,
          stripeSubId,
        });
        throw new Error("Missing planId or userId in invoice metadata");
      }

      const [plan] = await tx
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId));

      if (!plan) {
        logger.error("Plan not found when creating subscription", { planId });
        throw new Error(`Plan not found: ${planId}`);
      }

      // Create subscription
      const subscriptionId = stripeSubId;
      await tx.insert(subscriptions).values({
        id: subscriptionId,
        userId,
        planId: plan.id,
        status: "active",
        currentPeriodStart: new Date(periodStart * 1000),
        currentPeriodEnd: new Date(periodEnd * 1000),
        stripeSubscriptionId: stripeSubId,
        stripeCustomerId:
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id ?? null,
      });

      [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));

      if (!sub) {
        throw new Error("Failed to create subscription");
      }
    }

    const [plan] = await tx
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, sub.planId));

    if (!plan) {
      logger.warn("Plan not found for invoice", { planId: sub.planId });
      throw new Error(`Plan not found: ${sub.planId}`);
    }

    // ✅ FIX: Validate amount matches plan price
    const expectedAmount = PLAN_PRICES_USD_CENTS[plan.id as keyof typeof PLAN_PRICES_USD_CENTS];
    if (expectedAmount) {
      const expectedMonthly = expectedAmount.monthly;
      // Allow 1 cent tolerance for rounding
      if (Math.abs(amountPaid - expectedMonthly) > 1) {
        logger.error("Amount mismatch: payment amount doesn't match plan price", {
          planId: plan.id,
          expectedAmount: expectedMonthly,
          actualAmount: amountPaid,
          invoiceId: invoice.id,
        });
        // Don't throw - log and continue, but flag for review
        // In production, you might want to flag this for manual review
      }
    }

    const usdCents = amountPaid;

    // Record payment
    await tx.insert(payments).values({
      id: invoice.id,
      userId: sub.userId,
      subscriptionId: sub.id,
      planId: plan.id,
      provider: "stripe",
      status: "succeeded",
      amountUsdCents: usdCents,
      amountOriginal: usdCents,
      currency: currency as any,
      stripePaymentIntentId: paymentIntentId ?? null,
      stripeInvoiceId: invoice.id,
      description: `Stripe subscription invoice for ${plan.name}`,
      metadata: invoice.metadata ? JSON.parse(JSON.stringify(invoice.metadata)) : null,
      paidAt: new Date((invoice.status_transitions?.paid_at ?? Date.now()) * 1000),
    });

    // Update subscription period
    await tx
      .update(subscriptions)
      .set({
        status: "active",
        currentPeriodStart: new Date(periodStart * 1000),
        currentPeriodEnd: new Date(periodEnd * 1000),
      })
      .where(eq(subscriptions.id, sub.id));
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const stripeSubId = subscription.id;

  const status = subscription.status as
    | "active"
    | "canceled"
    | "past_due"
    | "unpaid"
    | "trialing"
    | "incomplete"
    | "incomplete_expired";

  const periodStart = subscription.current_period_start;
  const periodEnd = subscription.current_period_end;

  await db
    .update(subscriptions)
    .set({
      status,
      currentPeriodStart: periodStart
        ? new Date(periodStart * 1000)
        : new Date(),
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : new Date(),
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const stripeSubId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!stripeSubId) return;

  logger.warn("Stripe invoice payment failed", {
    invoiceId: invoice.id,
    subscriptionId: stripeSubId,
    amountDue: invoice.amount_due,
  });

  // ✅ FIX: Update subscription status to past_due
  await db
    .update(subscriptions)
    .set({
      status: "past_due",
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!paymentIntentId) return;

  // ✅ FIX: Use transaction for atomic updates
  await db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.stripePaymentIntentId, paymentIntentId));

    if (!payment) {
      logger.warn("Payment not found for refund", { paymentIntentId });
      return;
    }

    // Check if already refunded (idempotency)
    if (payment.status === "refunded") {
      logger.info("Payment already marked as refunded", { paymentId: payment.id });
      return;
    }

    // Update payment status
    await tx
      .update(payments)
      .set({
        status: "refunded",
      })
      .where(eq(payments.id, payment.id));

    // ✅ FIX: Cancel subscription if payment was for subscription
    if (payment.subscriptionId) {
      await tx
        .update(subscriptions)
        .set({
          status: "canceled",
          canceledAt: new Date(),
          cancelAtPeriodEnd: false, // Cancel immediately
        })
        .where(eq(subscriptions.id, payment.subscriptionId));

      logger.info("Subscription canceled due to refund", {
        subscriptionId: payment.subscriptionId,
        paymentId: payment.id,
      });
    }

    logger.info("Payment marked as refunded", {
      paymentId: payment.id,
      amountRefunded: charge.amount_refunded,
    });
  });
}


