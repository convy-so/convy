import { NextRequest } from "next/server";
import { Client, resources, Webhook } from "coinbase-commerce-node";

import { db } from "@/db";
import { payments, subscriptions, subscriptionPlans } from "@/db/schema";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

Client.init(env.COINBASE_COMMERCE_API_KEY);
const { Charge } = resources;

export async function POST(req: NextRequest) {
  const sig = req.headers.get("x-cc-webhook-signature");

  if (!sig) {
    return new Response("Missing Coinbase signature", { status: 400 });
  }

  const rawBody = await req.text();

  let event: any;

  try {
    event = Webhook.verifyEventBody(
      rawBody,
      sig,
      env.COINBASE_COMMERCE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Coinbase Commerce webhook verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    if (
      event.type === "charge:confirmed" ||
      event.type === "charge:resolved"
    ) {
      await handleChargeConfirmed(event);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error processing Coinbase Commerce webhook:", error);
    return new Response("Webhook handler error", { status: 500 });
  }
}

async function handleChargeConfirmed(event: any) {
  const chargeId = event.data.id as string;

  const charge = await Charge.retrieve(chargeId);

  if (!charge || !charge.id) {
    console.warn("Coinbase charge not found:", chargeId);
    return;
  }

  const metadata = (charge as any).metadata || {};
  const userId = metadata.userId as string | undefined;
  const planId = metadata.planId as string | undefined;

  if (!userId || !planId) {
    console.warn("Coinbase charge missing userId or planId metadata");
    return;
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId));

  if (!plan) {
    console.warn("Plan not found for Coinbase charge:", planId);
    return;
  }

  // Amount in USD from local pricing
  const localPrice = (charge as any).pricing?.local;

  if (!localPrice || localPrice.currency !== "USD") {
    console.warn("Unexpected Coinbase local price:", localPrice);
    return;
  }

  const amountUsd = parseFloat(localPrice.amount);
  const amountUsdCents = Math.round(amountUsd * 100);

  const paymentsResult = await db
    .select()
    .from(payments)
    .where(eq(payments.coinbaseChargeId, charge.id));

  const existingPayment = paymentsResult[0];

  if (!existingPayment) {
    // Create payment and subscription if not already present
    const subscriptionId = nanoid();

    await db.insert(subscriptions).values({
      id: subscriptionId,
      userId,
      planId: plan.id,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(
        new Date().setMonth(new Date().getMonth() + 1)
      ),
      metadata: {
        provider: "coinbase_commerce",
        chargeId: charge.id,
      },
    });

    await db.insert(payments).values({
      id: nanoid(),
      userId,
      subscriptionId,
      planId: plan.id,
      provider: "coinbase_commerce",
      status: "succeeded",
      amountUsdCents,
      amountOriginal: amountUsdCents,
      currency: "USD",
      coinbaseChargeId: charge.id,
      description: `Coinbase Commerce payment for ${plan.name}`,
      paidAt: new Date(),
    });
  } else {
    // Mark existing payment as succeeded
    await db
      .update(payments)
      .set({
        status: "succeeded",
        paidAt: new Date(),
        amountUsdCents,
        amountOriginal: amountUsdCents,
      })
      .where(eq(payments.id, existingPayment.id));
  }
}


