"use server";

import { nanoid } from "nanoid";
import Stripe from "stripe";

import { db } from "@/db";
import { payments } from "@/db/schema";
import { env } from "@/lib/env";
import { getVerifiedSession } from "@/lib/auth/session";
import { isWorkspaceOwner } from "@/lib/workspace-access";
import { ensurePlansSeeded, getPlanById, PLAN_PRICES_USD_CENTS } from "@/lib/billing/plans";
import { coinbaseClient } from "@/lib/billing/coinbase";
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

export async function createCoinbasePaymentLinkAction(input: {
  planId: "pro" | "premium";
  interval: "month" | "year";
  cancelUrl: string;
  successUrl: string;
}): Promise<ActionResult<{ paymentUrl: string; paymentLinkId: string }>> {
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

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const existingPendingPayment = await db.query.payments.findFirst({
      where: (p, { eq, and, gte }) => and(
        eq(p.userId, session.user.id),
        eq(p.planId, input.planId),
        eq(p.status, "pending"),
        eq(p.provider, "coinbase_business"),
        gte(p.createdAt, oneHourAgo)
      ),
    });

    if (existingPendingPayment && existingPendingPayment.coinbaseChargeId) {
      // Try to retrieve the existing payment link to get its URL
      try {
        const existingLink = await coinbaseClient.getPaymentLink(
          existingPendingPayment.coinbaseChargeId
        );
        
        if (existingLink && existingLink.url) {
          logger.info("Returning existing pending Coinbase payment link", { 
            paymentLinkId: existingLink.id,
            userId: session.user.id 
          });
          return { 
            success: true, 
            data: { 
              paymentUrl: existingLink.url, 
              paymentLinkId: existingLink.id 
            } 
          };
        }
      } catch (retrieveError) {
        // If retrieval fails, the payment link may have expired - continue to create new one
        logger.warn("Failed to retrieve existing Coinbase payment link, creating new one", { 
          paymentLinkId: existingPendingPayment.coinbaseChargeId,
          error: retrieveError
        });
      }
    }

    // Generate ID for the payment record beforehand to pass in metadata
    const paymentId = nanoid();

    // Convert cents to dollars for the API (which accepts string amounts)
    const amountUsd = (amountUsdCents / 100).toFixed(2);

    // Create payment link via the Payment Link API
    const paymentLink = await coinbaseClient.createPaymentLink({
      name: `${plan.name} Plan (${input.interval}ly)`,
      description: `${plan.name} subscription - ${input.interval}ly billing`,
      amount: amountUsd,
      currency: "USD",
      redirect_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: {
        userId: session.user.id,
        planId: input.planId,
        interval: input.interval,
        organizationId: activeOrgId ?? "",
        paymentId, 
      },
    });

    if (!paymentLink || !paymentLink.id || !paymentLink.url) {
      return {
        success: false,
        error: "Failed to create Coinbase payment link",
      };
    }

    // Record pending payment; it will be finalized on webhook confirmation
    await db.insert(payments).values({
      id: paymentId,
      userId: session.user.id,
      planId: plan.id,
      provider: "coinbase_business",
      status: "pending",
      amountUsdCents,
      amountOriginal: amountUsdCents,
      currency: "USD",
      coinbaseChargeId: paymentLink.id, // Store payment link ID (Checkout ID)
      description: `${plan.name} (${input.interval}) - Crypto Payment`,
      metadata: {
        userId: session.user.id,
        planId: input.planId,
        interval: input.interval,
        organizationId: activeOrgId ?? "",
        paymentMethod: "crypto",
        paymentId,
      },
    });

    logger.info("Coinbase payment link created and recorded", {
      paymentLinkId: paymentLink.id,
      userId: session.user.id,
      planId: input.planId,
      amount: amountUsd,
    });

    return { success: true, data: { paymentUrl: paymentLink.url, paymentLinkId: paymentLink.id } };
  } catch (error) {
    logger.error("Error creating Coinbase payment link", { error });
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create crypto payment link",
    };
  }
}


