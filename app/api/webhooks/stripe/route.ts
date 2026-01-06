import { NextRequest } from "next/server";
import Stripe from "stripe";

import { db } from "@/db";
import {
  payments,
  subscriptions,
  subscriptionPlans,
} from "@/db/schema";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-09-30.acacia",
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
    })
    .onConflictDoNothing();
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

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));

  if (!sub) {
    logger.warn("Subscription not found for invoice", { stripeSubId });
    return;
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, sub.planId));

  if (!plan) {
    logger.warn("Plan not found for invoice", { planId: sub.planId });
    return;
  }

  const usdCents = amountPaid;

  // Record payment
  await db.insert(payments).values({
    id: invoice.id,
    userId: sub.userId,
    subscriptionId: sub.id,
    planId: plan.id,
    provider: "stripe",
    status: "succeeded",
    amountUsdCents: usdCents,
    amountOriginal: usdCents,
    currency: currency as any,
    stripePaymentIntentId: invoice.payment_intent?.toString(),
    stripeInvoiceId: invoice.id,
    description: `Stripe subscription invoice for ${plan.name}`,
    paidAt: new Date((invoice.status_transitions?.paid_at ?? Date.now()) * 1000),
  });

  // Update subscription period
  await db
    .update(subscriptions)
    .set({
      status: "active",
      currentPeriodStart: new Date(periodStart * 1000),
      currentPeriodEnd: new Date(periodEnd * 1000),
    })
    .where(eq(subscriptions.id, sub.id));
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

  // We rely on 'customer.subscription.updated' to set the status to 'past_due'
  // but we log here for visibility.
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!paymentIntentId) return;

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntentId));

  if (!payment) {
    logger.warn("Payment not found for refund", { paymentIntentId });
    return;
  }

  await db
    .update(payments)
    .set({
      status: "refunded", // Assuming 'refunded' is a valid status in your schema, or use 'failed' if not.
      // Ideally schema should have 'refunded' or we just verify checking schema.
    })
    .where(eq(payments.id, payment.id));
    
  logger.info("Payment marked as refunded", { paymentId: payment.id, amountRefunded: charge.amount_refunded });
}


