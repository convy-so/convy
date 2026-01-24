import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/billing/lemonsqueezy";
import { env } from "@/lib/env";
import { db } from "@/db";
import {
  payments,
  subscriptions,
  subscriptionPlans,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { PLAN_PRICES_USD_CENTS } from "@/lib/billing/types";

export async function POST(req: NextRequest) {
  if (!env.LEMONSQUEEZY_WEBHOOK_SECRET) {
    return new Response("Lemon Squeezy Webhook Secret not set", { status: 500 });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature") || "";

    if (!verifyWebhookSignature(rawBody, signature, env.LEMONSQUEEZY_WEBHOOK_SECRET)) {
      return new Response("Invalid signature", { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const { meta, data } = payload;
    const eventName = meta.event_name;
    const customData = meta.custom_data || data.attributes.urls?.receipt; // Custom data is usually passed in checkout

    // Custom data is often in meta.custom_data if specific to the event, 
    // but for subscriptions, it's passed during checkout creation and persists.
    // However, Lemon Squeezy webhook payload for subscription events might not include custom_data in meta 
    // if it wasn't explicitly passed in a way that LS forwards it to every webhook.
    // Usually it IS in meta.custom_data if passed during checkout.
    
    // Fallback: Check data.attributes.test_mode
    
    logger.info("Received Lemon Squeezy webhook", { eventName, id: data.id });

    switch (eventName) {
      case "subscription_created":
      case "subscription_updated":
      case "subscription_cancelled":
      case "subscription_resumed":
      case "subscription_expired":
      case "subscription_paused":
      case "subscription_unpaused":
        await handleSubscriptionEvent(eventName, data, meta);
        break;
        
      case "subscription_payment_success":
        await handleSubscriptionPaymentSuccess(data, meta);
        break;
        
      case "subscription_payment_failed":
         // Log it
         logger.warn("Subscription payment failed", { id: data.id });
         break;

      default:
        // logger.debug("Unhandled Lemon Squeezy event", { eventName });
        break;
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    logger.error("Error processing Lemon Squeezy webhook", { error });
    return new Response("Server Error", { status: 500 });
  }
}

async function handleSubscriptionEvent(eventName: string, data: any, meta: any) {
    const apiSub = data.attributes;
    const lsSubscriptionId = data.id;
    const lsCustomerId = apiSub.customer_id.toString();
    const lsVariantId = apiSub.variant_id.toString();
    
    // Extract userId/orgId from custom_data
    // Note: custom_data comes as map: { userId: "...", planId: "..." }
    const customData = meta.custom_data || {};
    const userId = customData.userId;
    const planId = customData.planId;
    const organizationId = customData.organizationId;

    // Status mapping
    // LS statuses: on_trial, active, paused, past_due, unpaid, cancelled, expired, failing
    let status = "active";
    if (apiSub.status === "on_trial") status = "trialing";
    else if (apiSub.status === "paused") status = "paused"; // or canceled? We don't have paused enum yet, mapped to 'active' or custom?
    // Let's map strict to our enum
    // "active", "canceled", "past_due", "unpaid", "trialing", "incomplete", "incomplete_expired"
    
    switch (apiSub.status) {
        case "on_trial": status = "trialing"; break;
        case "active": status = "active"; break;
        case "paused": status = "active"; break; // Treat paused as active but maybe specialized logic needed
        case "past_due": status = "past_due"; break;
        case "unpaid": status = "unpaid"; break;
        case "cancelled": status = "canceled"; break;
        case "expired": status = "canceled"; break; // expired = canceled
        default: status = "active"; // fallback
    }

    // Upsert subscription
    // If it's a new subscription, we need userId/planId. If existing, we update.
    
    const existingSub = await db.query.subscriptions.findFirst({
        where: (s, { eq }) => eq(s.lemonSqueezySubscriptionId, lsSubscriptionId)
    });

    if (!existingSub) {
        // Create new
        if (!userId || !planId) {
             logger.error("Missing userId or planId for new Lemon Squeezy subscription", { lsSubscriptionId });
             return;
        }

        // Find internal plan by ID
        const internalPlan = await db.query.subscriptionPlans.findFirst({
            where: (p, { eq }) => eq(p.id, planId)
        });
        
        if (!internalPlan) {
             logger.error("Plan not found", { planId });
             return;
        }

        await db.insert(subscriptions).values({
            id: lsSubscriptionId, // Use LS ID as primary ID for simplicity, or generate nanoid? 
            // The schema says id is text primary key. We can use LS ID.
            userId,
            organizationId: organizationId || null,
            planId: internalPlan.id,
            status: status as any,
            currentPeriodStart: new Date(apiSub.renews_at), // This might be wrong. renews_at is end. created_at is start? 
            // actually LS has ends_at, renews_at, trial_ends_at.
            // Current period start is implied. 
            // We can approximate or just use created_at for start if new.
            // better: use renews_at as periodEnd.
            currentPeriodEnd: new Date(apiSub.renews_at),
            currentPeriodStart: new Date(apiSub.created_at), // Correct enough
            lemonSqueezySubscriptionId: lsSubscriptionId,
            lemonSqueezyCustomerId: lsCustomerId,
            metadata: {
                lemonSqueezyVariantId: lsVariantId
            }
        });
        
        logger.info("Created new Lemon Squeezy subscription", { id: lsSubscriptionId, userId });
    } else {
        // Update
        await db.update(subscriptions)
            .set({
                status: status as any,
                currentPeriodEnd: new Date(apiSub.renews_at),
                canceledAt: apiSub.ends_at ? new Date(apiSub.ends_at) : null,
                cancelAtPeriodEnd: apiSub.cancelled, // boolean in LS?
                // actually LS has `cancelled` boolean
            })
            .where(eq(subscriptions.lemonSqueezySubscriptionId, lsSubscriptionId));
            
        logger.info("Updated Lemon Squeezy subscription", { id: lsSubscriptionId, status });
    }
}

async function handleSubscriptionPaymentSuccess(data: any, meta: any) {
    const apiPayment = data.attributes;
    const lsSubscriptionId = apiPayment.subscription_id.toString();
    const amountCents = apiPayment.amount; // LS amount is in cents
    const currency = apiPayment.currency;
    
    // Find subscription
    const sub = await db.query.subscriptions.findFirst({
        where: (s, { eq }) => eq(s.lemonSqueezySubscriptionId, lsSubscriptionId)
    });

    if (!sub) {
        logger.warn("Received payment for unknown subscription", { lsSubscriptionId });
        return;
    }

    // Record payment
    await db.insert(payments).values({
        id: data.id, 
        userId: sub.userId,
        subscriptionId: sub.id,
        planId: sub.planId,
        provider: "lemonsqueezy",
        status: "succeeded",
        amountUsdCents: amountCents, // store in cents
        amountOriginal: amountCents,
        currency: currency.toUpperCase() as any,
        lemonSqueezyOrderId: data.id, // using invoice/payment ID as order ID
        lemonSqueezyInvoiceId: data.id,
        description: `Subscription renewal for ${sub.planId}`,
        paidAt: new Date(apiPayment.created_at)
    });
    
    logger.info("Recorded payment for subscription", { subscriptionId: sub.id, paymentId: data.id });
}
