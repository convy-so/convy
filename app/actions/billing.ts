"use server";

import { nanoid } from "nanoid";
import Stripe from "stripe";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { payments } from "@/db/schema";
import { env } from "@/lib/env";
import { getVerifiedSession } from "@/lib/auth/session";
import { isWorkspaceOwner } from "@/lib/workspace-access";
import { ensurePlansSeeded, getPlanById, PLAN_PRICES_USD_CENTS } from "@/lib/billing/plans";
import { coinbase } from "@/lib/billing/coinbase";
import { logger } from "@/lib/logger";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function createStripeCheckoutAction(input: {
  planId: "pro" | "premium";
  interval: "month" | "year";
  cancelUrl: string;
  successUrl: string;
}): Promise<ActionResult<{ url: string }>> {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      const isOwner = await isWorkspaceOwner(session.user.id, activeOrgId);
      if (!isOwner) {
        return { success: false, error: "Only workspace owner can manage billing" };
      }
    }
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
      payment_method_types: ["card"],
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
        organizationId: activeOrgId ?? "",
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
    logger.error("Error creating Stripe Checkout session", { error });
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
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      const isOwner = await isWorkspaceOwner(session.user.id, activeOrgId);
      if (!isOwner) {
        return { success: false, error: "Only workspace owner can manage billing" };
      }
    }
    await ensurePlansSeeded();

    const plan = await getPlanById(input.planId);

    if (!plan) {
      return { success: false, error: "Invalid plan" };
    }

    const priceMap = PLAN_PRICES_USD_CENTS[input.planId];
    const amountUsdCents =
      input.interval === "month" ? priceMap.monthly : priceMap.yearly;

    // Deduplication: Check for existing pending payment for this user/plan/interval
    // that was created in the last 60 minutes (Coinbase charges expire after ~1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const existingPendingPayment = await db.query.payments.findFirst({
      where: (p, { eq, and, gte }) => and(
        eq(p.userId, session.user.id),
        eq(p.planId, input.planId),
        eq(p.status, "pending"),
        eq(p.provider, "coinbase_commerce"),
        gte(p.createdAt, oneHourAgo)
      ),
    });

    if (existingPendingPayment && existingPendingPayment.coinbaseChargeId) {
      // Try to retrieve the existing charge to get its hosted URL
      try {
        const existingCharge = await coinbase.charges.retrieve(
          existingPendingPayment.coinbaseChargeId
        );
        
        if (existingCharge && existingCharge.hosted_url) {
          logger.info("Returning existing pending Coinbase charge", { 
            chargeId: existingCharge.id,
            userId: session.user.id 
          });
          return { 
            success: true, 
            data: { 
              hostedUrl: existingCharge.hosted_url, 
              chargeId: existingCharge.id 
            } 
          };
        }
      } catch (retrieveError) {
        // If retrieval fails, the charge may have expired - continue to create new one
        logger.warn("Failed to retrieve existing Coinbase charge, creating new one", { 
          chargeId: existingPendingPayment.coinbaseChargeId,
          error: retrieveError
        });
      }
    }

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
        organizationId: activeOrgId ?? "",
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
        organizationId: activeOrgId ?? "",
      },
    });

    return { success: true, data: { hostedUrl: charge.hosted_url, chargeId: charge.id } };
  } catch (error) {
    logger.error("Error creating Coinbase Commerce charge", { error });
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create Coinbase Commerce charge",
    };
  }
}



