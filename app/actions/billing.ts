"use server";

import { nanoid } from "nanoid";
import Stripe from "stripe";
import { Client, resources } from "coinbase-commerce-node";

import { db } from "@/db";
import { payments, subscriptions } from "@/db/schema";
import { env } from "@/lib/env";
import { getVerifiedSession } from "@/lib/auth/session";
import { ensurePlansSeeded, getPlanById, PLAN_PRICES_USD_CENTS } from "@/lib/billing/plans";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-09-30.acacia",
});

Client.init(env.COINBASE_COMMERCE_API_KEY);
const { Charge } = resources;

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getPlansAction(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      priceMonthlyUsdCents: number;
      priceYearlyUsdCents: number | null;
    }>
  >
> {
  await ensurePlansSeeded();

  const freeMonthly = 0;
  const premium = PLAN_PRICES_USD_CENTS.premium;
  const pro = PLAN_PRICES_USD_CENTS.pro;

  return {
    success: true,
    data: [
      {
        id: "free",
        name: "Free",
        priceMonthlyUsdCents: freeMonthly,
        priceYearlyUsdCents: freeMonthly,
      },
      {
        id: "pro",
        name: "Pro",
        priceMonthlyUsdCents: pro.monthly,
        priceYearlyUsdCents: pro.yearly,
      },
      {
        id: "premium",
        name: "Premium",
        priceMonthlyUsdCents: premium.monthly,
        priceYearlyUsdCents: premium.yearly,
      },
      {
        id: "enterprise",
        name: "Enterprise",
        priceMonthlyUsdCents: 0,
        priceYearlyUsdCents: null,
      },
    ],
  };
}

export async function createStripeCheckoutSessionAction(input: {
  planId: "pro" | "premium";
  interval: "month" | "year";
  successUrl: string;
  cancelUrl: string;
}): Promise<ActionResult<{ checkoutUrl: string }>> {
  try {
    const session = await getVerifiedSession();
    await ensurePlansSeeded();

    const plan = await getPlanById(input.planId);

    if (!plan) {
      return { success: false, error: "Invalid plan" };
    }

    const priceId =
      input.interval === "month"
        ? plan.stripePriceIdMonthly
        : plan.stripePriceIdYearly;

    if (!priceId) {
      return {
        success: false,
        error:
          "Stripe price is not configured for this plan. Please contact support.",
      };
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: session.user.email,
      metadata: {
        userId: session.user.id,
        planId: input.planId,
        interval: input.interval,
      },
    });

    if (!checkout.url) {
      return {
        success: false,
        error: "Failed to create Stripe Checkout session",
      };
    }

    return { success: true, data: { checkoutUrl: checkout.url } };
  } catch (error) {
    console.error("Error creating Stripe Checkout session:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create Stripe Checkout session",
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

    const charge = await Charge.create({
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


