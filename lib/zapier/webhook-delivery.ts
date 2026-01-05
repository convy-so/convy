/**
 * Zapier Webhook Delivery System
 * 
 * Handles delivery of survey data to Zapier webhooks
 */

import { db } from "@/db";
import {
  zapierWebhookSubscriptions,
  zapierWebhookDeliveries,
  surveys,
  surveyConversations,
  surveyAnalytics,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type WebhookEventType =
  | "survey_created"
  | "new_conversation"
  | "analytics_updated";

export type WebhookPayload = {
  event: WebhookEventType;
  data: Record<string, unknown>;
  timestamp: string;
};

/**
 * Format survey data for webhook payload
 */
async function formatSurveyData(surveyId: string): Promise<Record<string, unknown> | null> {
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) {
    return null;
  }

  return {
    id: survey.id,
    title: survey.title,
    status: survey.status,
    language: survey.language,
    participantLimit: survey.participantLimit,
    currentParticipants: survey.currentParticipants,
    objective: survey.objective,
    targetAudience: survey.targetAudience,
    scope: survey.scope,
    successCriteria: survey.successCriteria,
    constraints: survey.constraints,
    hypotheses: survey.hypotheses,
    tone: survey.tone,
    requiredQuestions: survey.requiredQuestions,
    createdAt: survey.createdAt.toISOString(),
    updatedAt: survey.updatedAt.toISOString(),
  };
}

/**
 * Format conversation data for webhook payload
 */
async function formatConversationData(
  conversationId: string
): Promise<Record<string, unknown> | null> {
  const [conversation] = await db
    .select()
    .from(surveyConversations)
    .where(eq(surveyConversations.id, conversationId));

  if (!conversation) {
    return null;
  }

  // Get survey info
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, conversation.surveyId));

  return {
    id: conversation.id,
    surveyId: conversation.surveyId,
    surveyTitle: survey?.title || null,
    participantId: conversation.participantId,
    rawConversation: conversation.rawConversation,
    summary: conversation.summary,
    completed: conversation.completed,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

/**
 * Format analytics data for webhook payload
 */
async function formatAnalyticsData(
  surveyId: string
): Promise<Record<string, unknown> | null> {
  const [analytics] = await db
    .select()
    .from(surveyAnalytics)
    .where(eq(surveyAnalytics.surveyId, surveyId));

  if (!analytics) {
    return null;
  }

  // Get survey info
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  return {
    id: analytics.id,
    surveyId: analytics.surveyId,
    surveyTitle: survey?.title || null,
    overallSummary: analytics.overallSummary,
    totalConversations: analytics.totalConversations,
    averageConversationLength: analytics.averageConversationLength,
    metrics: analytics.metrics,
    lastUpdated: analytics.lastUpdated.toISOString(),
  };
}

/**
 * Deliver webhook to a single subscription
 */
async function deliverWebhook(
  subscriptionId: string,
  payload: WebhookPayload
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const [subscription] = await db
    .select()
    .from(zapierWebhookSubscriptions)
    .where(eq(zapierWebhookSubscriptions.id, subscriptionId));

  if (!subscription || !subscription.active) {
    return { success: false, error: "Subscription not active" };
  }

  // Create delivery record
  const deliveryId = crypto.randomUUID();
  await db.insert(zapierWebhookDeliveries).values({
    id: deliveryId,
    subscriptionId,
    eventType: payload.event,
    surveyId: payload.data.id as string | undefined,
    conversationId:
      payload.event === "new_conversation"
        ? (payload.data.id as string)
        : undefined,
    status: "pending",
  });

  try {
    const response = await fetch(subscription.targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Convy-Zapier-Webhook/1.0",
      },
      body: JSON.stringify(payload),
      // Timeout after 30 seconds
      signal: AbortSignal.timeout(30000),
    });

    const responseBody = await response.text().catch(() => "");

    // Update delivery record
    await db
      .update(zapierWebhookDeliveries)
      .set({
        status: response.ok ? "success" : "failed",
        statusCode: response.status,
        responseBody: responseBody.substring(0, 1000), // Limit response body size
        deliveredAt: new Date(),
      })
      .where(eq(zapierWebhookDeliveries.id, deliveryId));

    // Update subscription stats
    await db
      .update(zapierWebhookSubscriptions)
      .set({
        lastTriggeredAt: new Date(),
        triggerCount: subscription.triggerCount + 1,
        errorCount: response.ok
          ? subscription.errorCount
          : subscription.errorCount + 1,
        lastError: response.ok ? null : `HTTP ${response.status}: ${responseBody.substring(0, 500)}`,
      })
      .where(eq(zapierWebhookSubscriptions.id, subscriptionId));

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Update delivery record with error
    await db
      .update(zapierWebhookDeliveries)
      .set({
        status: "failed",
        error: errorMessage.substring(0, 1000),
        deliveredAt: new Date(),
      })
      .where(eq(zapierWebhookDeliveries.id, deliveryId));

    // Update subscription stats
    await db
      .update(zapierWebhookSubscriptions)
      .set({
        errorCount: subscription.errorCount + 1,
        lastError: errorMessage.substring(0, 500),
      })
      .where(eq(zapierWebhookSubscriptions.id, subscriptionId));

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Trigger webhook for survey created event
 */
export async function triggerSurveyCreatedWebhook(surveyId: string, userId: string) {
  try {
    const surveyData = await formatSurveyData(surveyId);
    if (!surveyData) {
      console.warn(`[Zapier] Survey not found: ${surveyId}`);
      return;
    }

    // Get all active subscriptions for this user and event type
    const subscriptions = await db
      .select()
      .from(zapierWebhookSubscriptions)
      .where(
        and(
          eq(zapierWebhookSubscriptions.userId, userId),
          eq(zapierWebhookSubscriptions.eventType, "survey_created"),
          eq(zapierWebhookSubscriptions.active, true)
        )
      );

    if (subscriptions.length === 0) {
      return; // No subscriptions
    }

    const payload: WebhookPayload = {
      event: "survey_created",
      data: surveyData,
      timestamp: new Date().toISOString(),
    };

    // Deliver to all subscriptions (in parallel)
    await Promise.allSettled(
      subscriptions.map((sub) => deliverWebhook(sub.id, payload))
    );

    console.log(
      `[Zapier] Survey created webhook triggered for ${subscriptions.length} subscriptions`
    );
  } catch (error) {
    console.error("[Zapier] Error triggering survey created webhook:", error);
  }
}

/**
 * Trigger webhook for new conversation event
 */
export async function triggerNewConversationWebhook(
  conversationId: string,
  surveyId: string,
  userId: string
) {
  try {
    const conversationData = await formatConversationData(conversationId);
    if (!conversationData) {
      console.warn(`[Zapier] Conversation not found: ${conversationId}`);
      return;
    }

    // Get all active subscriptions for this user and event type
    // Filter by surveyId if specified in subscription
    const allSubscriptions = await db
      .select()
      .from(zapierWebhookSubscriptions)
      .where(
        and(
          eq(zapierWebhookSubscriptions.userId, userId),
          eq(zapierWebhookSubscriptions.eventType, "new_conversation"),
          eq(zapierWebhookSubscriptions.active, true)
        )
      );

    // Filter subscriptions: include if no surveyId filter or if surveyId matches
    const subscriptions = allSubscriptions.filter(
      (sub) => !sub.surveyId || sub.surveyId === surveyId
    );

    if (subscriptions.length === 0) {
      return; // No subscriptions
    }

    const payload: WebhookPayload = {
      event: "new_conversation",
      data: conversationData,
      timestamp: new Date().toISOString(),
    };

    // Deliver to all subscriptions (in parallel)
    await Promise.allSettled(
      subscriptions.map((sub) => deliverWebhook(sub.id, payload))
    );

    console.log(
      `[Zapier] New conversation webhook triggered for ${subscriptions.length} subscriptions`
    );
  } catch (error) {
    console.error("[Zapier] Error triggering new conversation webhook:", error);
  }
}

/**
 * Trigger webhook for analytics updated event
 */
export async function triggerAnalyticsUpdatedWebhook(
  surveyId: string,
  userId: string
) {
  try {
    const analyticsData = await formatAnalyticsData(surveyId);
    if (!analyticsData) {
      console.warn(`[Zapier] Analytics not found for survey: ${surveyId}`);
      return;
    }

    // Get all active subscriptions for this user and event type
    // Filter by surveyId if specified in subscription
    const allSubscriptions = await db
      .select()
      .from(zapierWebhookSubscriptions)
      .where(
        and(
          eq(zapierWebhookSubscriptions.userId, userId),
          eq(zapierWebhookSubscriptions.eventType, "analytics_updated"),
          eq(zapierWebhookSubscriptions.active, true)
        )
      );

    // Filter subscriptions: include if no surveyId filter or if surveyId matches
    const subscriptions = allSubscriptions.filter(
      (sub) => !sub.surveyId || sub.surveyId === surveyId
    );

    if (subscriptions.length === 0) {
      return; // No subscriptions
    }

    const payload: WebhookPayload = {
      event: "analytics_updated",
      data: analyticsData,
      timestamp: new Date().toISOString(),
    };

    // Deliver to all subscriptions (in parallel)
    await Promise.allSettled(
      subscriptions.map((sub) => deliverWebhook(sub.id, payload))
    );

    console.log(
      `[Zapier] Analytics updated webhook triggered for ${subscriptions.length} subscriptions`
    );
  } catch (error) {
    console.error("[Zapier] Error triggering analytics updated webhook:", error);
  }
}

