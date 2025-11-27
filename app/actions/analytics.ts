"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  conversationInsights,
  surveyAnalytics,
  surveyConversations,
  surveys,
} from "@/db/schema";
import { analysisModel, generateAIResponse } from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/session";
import { getOverallAnalyticsPrompt, type SurveyConfig } from "@/lib/prompts";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Generate overall analytics for a survey
 * This aggregates all conversations and generates comprehensive analytics
 */
export async function generateSurveyAnalyticsAction(
  surveyId: string
): Promise<
  ActionResult<{
    overallSummary: string;
    metrics: Record<string, unknown>;
    totalConversations: number;
    averageConversationLength: number;
  }>
> {
  try {
    const session = await getVerifiedSession();

    // Verify survey ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Get all completed conversations with their summaries and insights
    const conversations = await db
      .select({
        id: surveyConversations.id,
        summary: surveyConversations.summary,
        rawConversation: surveyConversations.rawConversation,
        insights: conversationInsights.keyFindings,
      })
      .from(surveyConversations)
      .leftJoin(
        conversationInsights,
        eq(conversationInsights.conversationId, surveyConversations.id)
      )
      .where(
        eq(surveyConversations.surveyId, surveyId)
      );

    const completedConversations = conversations.filter((c) => c.summary);

    if (completedConversations.length === 0) {
      return {
        success: false,
        error: "No completed conversations found. Generate insights for conversations first.",
      };
    }

    // Prepare survey config
    const surveyConfig: SurveyConfig = {
      goal: survey.goal,
      type: survey.type,
      information: survey.information,
      requiredQuestions: survey.requiredQuestions,
      metrics: survey.metrics || [],
    };

    // Prepare conversation data for analytics
    const conversationsData = completedConversations.map((conv) => ({
      id: conv.id,
      summary: conv.summary || "",
      insights: conv.insights || "",
    }));

    // Generate overall analytics
    const analyticsPrompt = getOverallAnalyticsPrompt(conversationsData, surveyConfig);
    const analyticsText = await generateAIResponse(analyticsPrompt, undefined, {
      model: analysisModel,
      temperature: 0.5,
      maxTokens: 3000,
    });

    // Parse analytics (try to extract structured data)
    let metrics: Record<string, unknown>;
    let overallSummary: string;

    try {
      // Try to extract JSON metrics if present
      const jsonMatch = analyticsText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        metrics = JSON.parse(jsonMatch[0]);
        overallSummary = analyticsText.replace(jsonMatch[0], "").trim();
      } else {
        // Extract summary (usually first paragraph or section)
        const summaryMatch = analyticsText.match(/^([\s\S]*?)(?:\n\n|$)/);
        overallSummary = summaryMatch ? summaryMatch[1] : analyticsText;
        metrics = {
          raw: analyticsText,
        };
      }
    } catch {
      overallSummary = analyticsText;
      metrics = {
        raw: analyticsText,
      };
    }

    // Calculate statistics
    const totalConversations = completedConversations.length;
    const totalMessages = completedConversations.reduce(
      (sum, conv) => sum + (conv.rawConversation?.length || 0),
      0
    );
    const averageConversationLength = totalConversations > 0
      ? Math.round(totalMessages / totalConversations)
      : 0;

    // Save or update analytics
    const [existingAnalytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    if (existingAnalytics) {
      await db
        .update(surveyAnalytics)
        .set({
          overallSummary,
          metrics,
          totalConversations,
          averageConversationLength,
          lastUpdated: new Date(),
        })
        .where(eq(surveyAnalytics.surveyId, surveyId));
    } else {
      await db.insert(surveyAnalytics).values({
        id: crypto.randomUUID(),
        surveyId,
        overallSummary,
        metrics,
        totalConversations,
        averageConversationLength,
      });
    }

    return {
      success: true,
      data: {
        overallSummary,
        metrics,
        totalConversations,
        averageConversationLength,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to generate analytics" };
  }
}

/**
 * Get analytics for a survey
 */
export async function getSurveyAnalyticsAction(
  surveyId: string
): Promise<
  ActionResult<{
    overallSummary: string;
    metrics: Record<string, unknown>;
    totalConversations: number;
    averageConversationLength: number;
    lastUpdated: Date | null;
  }>
> {
  try {
    const session = await getVerifiedSession();

    // Verify survey ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Get analytics
    const [analytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    if (!analytics) {
      return {
        success: false,
        error: "Analytics not found. Generate analytics first.",
      };
    }

    return {
      success: true,
      data: {
        overallSummary: analytics.overallSummary,
        metrics: analytics.metrics,
        totalConversations: analytics.totalConversations,
        averageConversationLength: analytics.averageConversationLength,
        lastUpdated: analytics.lastUpdated,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch analytics" };
  }
}

/**
 * Get dashboard data for a survey (all data needed for the dashboard)
 */
export async function getDashboardDataAction(
  surveyId: string
): Promise<
  ActionResult<{
    survey: {
      id: string;
      title: string;
      status: string;
      currentParticipants: number;
      participantLimit: number;
      shareableLink: string | null;
      createdAt: Date;
    };
    analytics: {
      overallSummary: string;
      metrics: Record<string, unknown>;
      totalConversations: number;
      averageConversationLength: number;
      lastUpdated: Date | null;
    } | null;
    conversationsCount: number;
    completedConversationsCount: number;
  }>
> {
  try {
    const session = await getVerifiedSession();

    // Verify survey ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Get analytics
    const [analytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    // Get conversation counts
    const allConversations = await db
      .select({ completed: surveyConversations.completed })
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId));

    const conversationsCount = allConversations.length;
    const completedConversationsCount = allConversations.filter(
      (c) => c.completed
    ).length;

    return {
      success: true,
      data: {
        survey: {
          id: survey.id,
          title: survey.title,
          status: survey.status,
          currentParticipants: survey.currentParticipants,
          participantLimit: survey.participantLimit,
          shareableLink: survey.shareableLink,
          createdAt: survey.createdAt,
        },
        analytics: analytics
          ? {
              overallSummary: analytics.overallSummary,
              metrics: analytics.metrics,
              totalConversations: analytics.totalConversations,
              averageConversationLength: analytics.averageConversationLength,
              lastUpdated: analytics.lastUpdated,
            }
          : null,
        conversationsCount,
        completedConversationsCount,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch dashboard data" };
  }
}

