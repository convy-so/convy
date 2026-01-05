/**
 * Zapier REST Hook Unsubscribe Endpoint
 * 
 * This endpoint handles unsubscription requests from Zapier.
 * When a user disables a Zap, Zapier will call this to unsubscribe from webhook events.
 */

import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import { zapierWebhookSubscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const session = await getVerifiedSession();
    const body = await req.json();

    // Zapier sends: target_url, event
    const { target_url, event, id } = body;

    if (!id && (!target_url || !event)) {
      return NextResponse.json(
        {
          status: "error",
          message: "Either id or (target_url and event) are required",
        },
        { status: 400 }
      );
    }

    // Find subscription to unsubscribe
    const whereConditions = id
      ? eq(zapierWebhookSubscriptions.id, id)
      : and(
          eq(zapierWebhookSubscriptions.userId, session.user.id),
          eq(zapierWebhookSubscriptions.targetUrl, target_url),
          eq(zapierWebhookSubscriptions.eventType, event)
        );

    const [subscription] = await db
      .select()
      .from(zapierWebhookSubscriptions)
      .where(whereConditions);

    if (!subscription) {
      return NextResponse.json(
        {
          status: "error",
          message: "Subscription not found",
        },
        { status: 404 }
      );
    }

    // Verify ownership
    if (subscription.userId !== session.user.id) {
      return NextResponse.json(
        {
          status: "error",
          message: "Unauthorized",
        },
        { status: 403 }
      );
    }

    // Deactivate subscription
    await db
      .update(zapierWebhookSubscriptions)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(eq(zapierWebhookSubscriptions.id, subscription.id));

    return NextResponse.json({
      status: "success",
      id: subscription.id,
    });
  } catch (error) {
    console.error("Zapier unsubscribe error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unsubscription failed",
      },
      { status: 500 }
    );
  }
}

