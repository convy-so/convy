"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { surveyAnalytics, surveyConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { enqueueSurveyAnalytics } from "@/lib/queue";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Generate overall analytics for a survey (via background job)
 * This aggregates all conversations and generates comprehensive analytics
 */
export async function generateSurveyAnalyticsAction(
  surveyId: string
): Promise<ActionResult<{ jobId: string }>> {
  try {
    const session = await getVerifiedSession();

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

    const conversations = await db
      .select({
        id: surveyConversations.id,
        summary: surveyConversations.summary,
      })
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId));

    const completedConversations = conversations.filter((c) => c.summary);

    if (completedConversations.length === 0) {
      return {
        success: false,
        error:
          "No completed conversations found. Generate insights for conversations first.",
      };
    }
    const job = await enqueueSurveyAnalytics({
      surveyId,
      userId: session.user.id,
    });

    return {
      success: true,
      data: {
        jobId: job.id!,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to enqueue analytics generation" };
  }
}

/**
 * Get analytics for a survey
 */
export async function getSurveyAnalyticsAction(surveyId: string): Promise<
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
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
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
export async function getDashboardDataAction(surveyId: string): Promise<
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

    const [analytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

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
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch dashboard data" };
  }
}
