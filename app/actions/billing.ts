"use server";

import { nanoid } from "nanoid";
import Stripe from "stripe";
// import { CommerceSDK } from "commerce-node";

import { db } from "@/db";
import { payments, subscriptions } from "@/db/schema";
import { env } from "@/lib/env";
import { getVerifiedSession } from "@/lib/auth/session";
import { ensurePlansSeeded, getPlanById, PLAN_PRICES_USD_CENTS } from "@/lib/billing/plans";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Initialize Coinbase Commerce SDK - REMOVED
// const commerce = new CommerceSDK({
//   apiKey: env.COINBASE_COMMERCE_API_KEY,
// });
import { coinbase } from "@/lib/billing/coinbase";

// ... existing types ...

export async function createStripeCheckoutAction(input: {
  planId: "pro" | "premium";
  interval: "month" | "year";
  cancelUrl: string;
  successUrl: string;
}): Promise<ActionResult<{ url: string }>> {
  try {
    const session = await getVerifiedSession();
    await ensurePlansSeeded();

    const plan = await getPlanById(input.planId);

    if (!plan) {
      return { success: false, error: "Invalid plan" };
    }

    const priceMap = PLAN_PRICES_USD_CENTS[input.planId];
    const amountUsdCents =
      input.interval === "month" ? priceMap.monthly : priceMap.yearly;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"], // card supports automatic currency conversion usually
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${plan.name} (${input.interval})`,
              description: `${plan.name} subscription`,
            },
            unit_amount: amountUsdCents,
            recurring: {
              interval: input.interval,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: session.user.id,
        planId: input.planId,
        interval: input.interval,
      },
      client_reference_id: session.user.id,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: session.user.email,
    });

    if (!checkoutSession.url) {
       return { success: false, error: "Failed to create Stripe Checkout URL" };
    }

    return { success: true, data: { url: checkoutSession.url } };
  } catch (error) {
    console.error("Error creating Stripe Checkout session:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create Stripe payment session",
    };
  }
}

export async function createCoinbaseChargeAction(input: {
  planId: "pro" | "premium";
  interval: "month" | "year";
  cancelUrl: string;
  successUrl: string;
}): Promise<ActionResult<{ hostedUrl: string; chargeId: string }>> {
  try {
    const session = await getVerifiedSession();
    await ensurePlansSeeded();

    const plan = await getPlanById(input.planId);

    if (!plan) {
      return { success: false, error: "Invalid plan" };
    }

    const priceMap = PLAN_PRICES_USD_CENTS[input.planId];
    const amountUsdCents =
      input.interval === "month" ? priceMap.monthly : priceMap.yearly;

    const amountUsd = (amountUsdCents / 100).toFixed(2);

    const charge = await coinbase.charges.create({
      name: `${plan.name} (${input.interval})`,
      description: `${plan.name} subscription via Coinbase Commerce`,
      pricing_type: "fixed_price",
      local_price: {
        amount: amountUsd,
        currency: "USD",
      },
      redirect_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: {
        userId: session.user.id,
        planId: input.planId,
        interval: input.interval,
      },
    });

    if (!charge || !charge.id || !charge.hosted_url) {
      return {
        success: false,
        error: "Failed to create Coinbase Commerce charge",
      };
    }

    // Record pending payment; it will be finalized on webhook confirmation
    await db.insert(payments).values({
      id: nanoid(),
      userId: session.user.id,
      planId: plan.id,
      provider: "coinbase_commerce",
      status: "pending",
      amountUsdCents,
      amountOriginal: amountUsdCents,
      currency: "USD",
      coinbaseChargeId: charge.id,
      description: `${plan.name} (${input.interval})`,
      metadata: {
        userId: session.user.id,
        planId: input.planId,
        interval: input.interval,
      },
    });

    return { success: true, data: { hostedUrl: charge.hosted_url, chargeId: charge.id } };
  } catch (error) {
    console.error("Error creating Coinbase Commerce charge:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create Coinbase Commerce charge",
    };
  }
}


