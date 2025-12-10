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
    
    // Manual trigger: Reset counter and generate immediately
    // This bypasses the automatic scheduling system
    try {
      const { resetAnalyticsCounterAfterGeneration } = await import(
        "@/lib/analytics-scheduler"
      );
      await resetAnalyticsCounterAfterGeneration(surveyId);
    } catch (error) {
      console.error("Failed to reset analytics counter for manual trigger:", error);
      // Continue anyway
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

    // If analytics don't exist, check if there are completed conversations
    // If so, automatically trigger analytics generation
    if (!analytics) {
      const conversations = await db
        .select({
          id: surveyConversations.id,
          summary: surveyConversations.summary,
        })
        .from(surveyConversations)
        .where(eq(surveyConversations.surveyId, surveyId));

      const completedConversations = conversations.filter((c) => c.summary);

      if (completedConversations.length > 0) {
        // Auto-trigger analytics generation using the scheduler
        // This will respect the accumulation/debouncing logic
        try {
          const { scheduleAnalyticsOnNewResponse } = await import(
            "@/lib/analytics-scheduler"
          );
          await scheduleAnalyticsOnNewResponse(surveyId, session.user.id);
          console.log(
            `[Analytics Action] Scheduled analytics generation for survey ${surveyId}`
          );
        } catch (error) {
          console.error(
            "[Analytics Action] Failed to schedule analytics generation:",
            error
          );
        }

        // Return a message indicating analytics are being generated
        return {
          success: false,
          error: "Analytics are being generated. Please refresh in a moment.",
        };
      }

      return {
        success: false,
        error: "No completed conversations found. Analytics will be generated automatically once conversations are completed.",
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
      .select({ 
        completed: surveyConversations.completed,
        summary: surveyConversations.summary,
      })
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId));

    const conversationsCount = allConversations.length;
    const completedConversationsCount = allConversations.filter(
      (c) => c.completed
    ).length;

    // If analytics don't exist but there are completed conversations with summaries,
    // auto-trigger analytics generation
    if (!analytics) {
      const completedWithSummaries = allConversations.filter(
        (c) => c.completed && c.summary
      );

      if (completedWithSummaries.length > 0) {
        try {
          const { scheduleAnalyticsOnNewResponse } = await import(
            "@/lib/analytics-scheduler"
          );
          await scheduleAnalyticsOnNewResponse(surveyId, session.user.id);
          console.log(
            `[Dashboard Action] Scheduled analytics generation for survey ${surveyId}`
          );
        } catch (error) {
          console.error(
            "[Dashboard Action] Failed to schedule analytics generation:",
            error
          );
        }
      }
    }

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
