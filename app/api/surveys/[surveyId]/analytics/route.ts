import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  surveys,
  surveyAnalytics,
  surveyConversations,
  conversationInsights,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  createDashboardWidgets,
  ANALYTICS_DATA_VERSION,
  type SurveyAnalyticsData,
  type ConversationInsightData,
  type DashboardWidget,
} from "@/lib/analytics";

/**
 * GET /api/surveys/[surveyId]/analytics
 *
 * Returns comprehensive analytics data for a survey, optimized for dashboard display.
 *
 * Query Parameters:
 * - format: "full" | "summary" | "widgets" (default: "full")
 * - regenerateWidgets: "true" to regenerate dashboard widgets from stored data
 *
 * Response includes:
 * - Executive summary for quick overview
 * - Core metrics (completion rates, engagement, etc.)
 * - Creator-defined metrics with chart-ready data
 * - Hypothesis validations
 * - AI-discovered insights (trends, patterns, recommendations)
 * - Goal achievement assessment
 * - Dashboard widgets ready for rendering
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "full";
    const regenerateWidgets = searchParams.get("regenerateWidgets") === "true";

    // Verify survey ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    if (survey.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Fetch analytics
    const [analytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    if (!analytics) {
      // Check if there are any conversations
      const conversations = await db
        .select({
          id: surveyConversations.id,
          completed: surveyConversations.completed,
        })
        .from(surveyConversations)
        .where(eq(surveyConversations.surveyId, surveyId));

      const completedCount = conversations.filter((c) => c.completed).length;

      return NextResponse.json(
        {
          status: "not_generated",
          message:
            completedCount > 0
              ? "Analytics are being generated. Please check back shortly."
              : "No completed conversations yet. Analytics will be generated after conversations are completed.",
          conversationStats: {
            total: conversations.length,
            completed: completedCount,
          },
        },
        { status: 200 }
      );
    }

    // Parse stored metrics (which contains the full analytics data)
    const storedMetrics = analytics.metrics as Partial<SurveyAnalyticsData>;

    // If format is "summary", return only executive summary
    if (format === "summary") {
      return NextResponse.json({
        status: "ready",
        surveyId,
        surveyTitle: survey.title,
        lastUpdated: analytics.lastUpdated,
        dataVersion: storedMetrics.dataVersion || "1.0",
        summary: {
          headline:
            storedMetrics.executiveSummary?.headline ||
            analytics.overallSummary?.split("\n")[0],
          keyInsights: storedMetrics.executiveSummary?.keyInsights || [],
          overallSentiment:
            storedMetrics.executiveSummary?.overallSentiment || null,
          totalConversations: analytics.totalConversations,
          completionRate: storedMetrics.coreMetrics?.completionRate || 0,
          insightQualityScore:
            storedMetrics.coreMetrics?.insightQualityScore || 0,
          goalAchievementScore:
            storedMetrics.goalAssessment?.achievementScore || 0,
        },
      });
    }

    // Reconstruct full analytics data
    const analyticsData: SurveyAnalyticsData = {
      surveyId,
      surveyTitle: survey.title,
      generatedAt:
        storedMetrics.generatedAt || analytics.createdAt.toISOString(),
      dataVersion: storedMetrics.dataVersion || ANALYTICS_DATA_VERSION,

      executiveSummary: storedMetrics.executiveSummary || {
        headline:
          analytics.overallSummary?.split("\n")[0] ||
          "Survey analysis complete",
        keyInsights: [],
        overallSentiment: { overall: "neutral", score: 0, confidence: 0.5 },
        recommendedActions: [],
      },

      coreMetrics: storedMetrics.coreMetrics || {
        totalConversations: analytics.totalConversations,
        completedConversations: analytics.totalConversations,
        completionRate: 100,
        averageMessagesPerConversation: analytics.averageConversationLength,
        averageResponseLength: 0,
        averageFollowUpDepth: 0,
        medianDurationMinutes: 0,
        insightQualityScore: 5,
        responseEngagementDistribution: { high: 0, medium: 0, low: 0 },
        topicCoverageRate: 0,
        requiredQuestionsCompletion: [],
      },

      creatorMetrics: storedMetrics.creatorMetrics || [],
      hypothesisValidations: storedMetrics.hypothesisValidations || [],

      discoveredInsights: storedMetrics.discoveredInsights || {
        trends: [],
        outliers: [],
        recommendations: [],
        emergentTopics: [],
        surprisingFindings: [],
        dataGaps: [],
      },

      goalAssessment: storedMetrics.goalAssessment || {
        surveyObjective: "",
        achievementScore: 5,
        achievementLevel: "partially_met",
        insightTypesCollected: {
          emotional: {
            collected: false,
            count: 0,
            quality: "low",
            examples: [],
          },
          behavioral: {
            collected: false,
            count: 0,
            quality: "low",
            examples: [],
          },
          rational: {
            collected: false,
            count: 0,
            quality: "low",
            examples: [],
          },
        },
        successfulAspects: [],
        gapsIdentified: [],
        recommendedNextSteps: [],
        suggestedFollowUpQuestions: [],
      },

      dashboardWidgets: [],
      conversationCount: analytics.totalConversations,
      lastUpdated:
        analytics.lastUpdated?.toISOString() ||
        analytics.updatedAt.toISOString(),
    };

    // Generate or regenerate widgets
    if (regenerateWidgets || !storedMetrics.dashboardWidgets) {
      analyticsData.dashboardWidgets = createDashboardWidgets(analyticsData);
    } else {
      analyticsData.dashboardWidgets =
        storedMetrics.dashboardWidgets as DashboardWidget[];
    }

    // If format is "widgets", return only widgets
    if (format === "widgets") {
      return NextResponse.json({
        status: "ready",
        surveyId,
        lastUpdated: analytics.lastUpdated,
        widgets: analyticsData.dashboardWidgets,
      });
    }

    // Return full analytics data
    return NextResponse.json({
      status: "ready",
      ...analyticsData,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
    }
    console.error("[Analytics API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/surveys/[surveyId]/analytics
 *
 * Trigger analytics regeneration for a survey.
 *
 * Request Body:
 * - force: boolean - Force regeneration even if recent analytics exist
 *
 * Returns job ID for tracking generation progress.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    // Verify survey ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    if (survey.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check for completed conversations
    const conversations = await db
      .select({
        id: surveyConversations.id,
        summary: surveyConversations.summary,
      })
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId));

    const completedWithInsights = conversations.filter((c) => c.summary);

    if (completedWithInsights.length === 0) {
      return NextResponse.json(
        {
          error: "No completed conversations with insights found.",
          message:
            "Complete some survey conversations first, then insights will be generated automatically.",
        },
        { status: 400 }
      );
    }

    // Check if recent analytics exist (within last 5 minutes) unless force is true
    if (!force) {
      const [existingAnalytics] = await db
        .select()
        .from(surveyAnalytics)
        .where(eq(surveyAnalytics.surveyId, surveyId));

      if (existingAnalytics?.lastUpdated) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (existingAnalytics.lastUpdated > fiveMinutesAgo) {
          return NextResponse.json({
            status: "recent_exists",
            message:
              "Recent analytics already exist. Use force=true to regenerate.",
            lastUpdated: existingAnalytics.lastUpdated,
          });
        }
      }
    }

    // Import and enqueue analytics job
    const { enqueueSurveyAnalytics } = await import("@/lib/queue");
    const { resetAnalyticsCounterAfterGeneration } =
      await import("@/lib/analytics-scheduler");

    // Reset counter before manual regeneration
    await resetAnalyticsCounterAfterGeneration(surveyId);

    const job = await enqueueSurveyAnalytics({
      surveyId,
      userId: session.user.id,
    });

    return NextResponse.json({
      status: "generating",
      message: "Analytics generation started",
      jobId: job.id,
      conversationsToAnalyze: completedWithInsights.length,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
    }
    console.error("[Analytics API] Error:", error);
    return NextResponse.json(
      { error: "Failed to trigger analytics generation" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/surveys/[surveyId]/analytics/conversations
 *
 * Returns individual conversation insights for drill-down analysis.
 * Separate endpoint to avoid bloating the main analytics response.
 */
export async function getConversationInsights(
  surveyId: string,
  userId: string
): Promise<ConversationInsightData[]> {
  // Verify survey ownership
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey || survey.userId !== userId) {
    throw new Error("Unauthorized");
  }

  // Fetch all conversations with insights
  const conversations = await db
    .select({
      id: surveyConversations.id,
      summary: surveyConversations.summary,
      rawConversation: surveyConversations.rawConversation,
      insights: conversationInsights.insights,
      keyFindings: conversationInsights.keyFindings,
    })
    .from(surveyConversations)
    .leftJoin(
      conversationInsights,
      eq(conversationInsights.conversationId, surveyConversations.id)
    )
    .where(eq(surveyConversations.surveyId, surveyId));

  return conversations
    .filter((c) => c.insights)
    .map((c) => {
      const stored = c.insights as Record<string, unknown>;
      return {
        conversationId: c.id,
        summary: (stored.summary as string) || c.summary || "",
        keyFindings: c.keyFindings?.split("\n\n") || [],
        messageCount:
          (stored.messageCount as number) || c.rawConversation?.length || 0,
        participantResponseCount:
          (stored.participantResponseCount as number) || 0,
        averageResponseLength: (stored.averageResponseLength as number) || 0,
        durationMinutes: (stored.durationMinutes as number) || 0,
        followUpDepth: (stored.followUpDepth as number) || 0,
        engagementLevel:
          (stored.engagementLevel as "high" | "medium" | "low") || "medium",
        responseQuality: (stored.responseQuality as number) || 5,
        topicsCovered: (stored.topicsCovered as string[]) || [],
        requiredQuestionsCovered:
          (stored.requiredQuestionsCovered as string[]) || [],
        requiredQuestionsMissed:
          (stored.requiredQuestionsMissed as string[]) || [],
        sentiment:
          (stored.sentiment as ConversationInsightData["sentiment"]) || {
            overall: "neutral",
            score: 0,
            confidence: 0.5,
          },
        extractedMetrics:
          (stored.extractedMetrics as Record<
            string,
            string | number | boolean
          >) || {},
        notableQuotes:
          (stored.notableQuotes as ConversationInsightData["notableQuotes"]) ||
          [],
        hypothesisEvidence:
          (stored.hypothesisEvidence as ConversationInsightData["hypothesisEvidence"]) ||
          [],
        mediaInteractions:
          (stored.mediaInteractions as ConversationInsightData["mediaInteractions"]) ||
          [],
      };
    });
}
