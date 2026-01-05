/**
 * Zapier REST Hook Subscribe Endpoint
 * 
 * This endpoint handles subscription requests from Zapier.
 * When a user sets up a Zap, Zapier will call this to subscribe to webhook events.
 */

import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import {
  zapierIntegrations,
  zapierWebhookSubscriptions,
} from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const session = await getVerifiedSession();
    const body = await req.json();

    // Zapier sends: target_url, event, subscribe
    const { target_url, event, subscribe } = body;

    if (!target_url || !event) {
      return NextResponse.json(
        {
          status: "error",
          message: "target_url and event are required",
        },
        { status: 400 }
      );
    }

    // Get or create Zapier integration
    let [integration] = await db
      .select()
      .from(zapierIntegrations)
      .where(eq(zapierIntegrations.userId, session.user.id));

    if (!integration) {
      const newIntegration = await db.insert(zapierIntegrations).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        enabled: true,
      }).returning();
      integration = newIntegration[0];
    }

    // Validate event type
    const validEventTypes = [
      "survey_created",
      "new_conversation",
      "analytics_updated",
    ];
    if (!validEventTypes.includes(event)) {
      return NextResponse.json(
        {
          status: "error",
          message: `Invalid event type. Must be one of: ${validEventTypes.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (subscribe) {
      // Create subscription
      const subscriptionId = crypto.randomUUID();
      await db.insert(zapierWebhookSubscriptions).values({
        id: subscriptionId,
        userId: session.user.id,
        zapierIntegrationId: integration.id,
        targetUrl: target_url,
        eventType: event,
        active: true,
        // Optional: surveyId can be passed in body for filtering
        surveyId: body.survey_id || null,
      });

      return NextResponse.json({
        status: "success",
        id: subscriptionId,
        target_url,
        event,
      });
    } else {
      // Unsubscribe - handled by unsubscribe endpoint
      return NextResponse.json(
        {
          status: "error",
          message: "Use unsubscribe endpoint to remove subscriptions",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Zapier subscribe error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Subscription failed",
      },
      { status: 500 }
    );
  }
}

