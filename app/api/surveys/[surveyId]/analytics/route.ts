import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
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
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "full";
    const regenerateWidgets = searchParams.get("regenerateWidgets") === "true";

    const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
    const access = await getSurveyAccessLevel(session.user.id, surveyId);

    if (access === "none") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [survey] = await getDb()
      .select({ title: surveys.title })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    // Fetch analytics
    const [analytics] = await getDb()
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    if (!analytics) {
      const conversations = await getDb()
        .select({
          id: surveyConversations.id,
          completed: surveyConversations.completed,
        })
        .from(surveyConversations)
        .where(eq(surveyConversations.surveyId, surveyId));

      const totalCount = conversations.length;
      const completedCount = conversations.filter((c) => c.completed).length;
      const completionRate =
        totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      const partialAnalytics: SurveyAnalyticsData = {
        surveyId,
        surveyTitle: survey.title,
        generatedAt: new Date().toISOString(),
        dataVersion: ANALYTICS_DATA_VERSION,
        executiveSummary: {
          headline:
            totalCount > 0
              ? "Data collection in progress"
              : "Ready to collect responses",
          keyInsights: [],
          overallSentiment: { overall: "neutral", score: 0, confidence: 0 },
          recommendedActions: [],
        },
        coreMetrics: {
          totalConversations: totalCount,
          completedConversations: completedCount,
          completionRate: completionRate,
          averageMessagesPerConversation: 0,
          averageResponseLength: 0,
          averageFollowUpDepth: 0,
          medianDurationMinutes: 0,
          medianActiveDurationMinutes: 0,
          insightQualityScore: 0,
          responseEngagementDistribution: { high: 0, medium: 0, low: 0 },
          requiredQuestionsCompletion: [],
          topicCoverageRate: 0,
        },
        creatorMetrics: [],
        hypothesisValidations: [],
        discoveredInsights: {
          trends: [],
          outliers: [],
          recommendations: [],
          emergentTopics: [],
          surprisingFindings: [],
          dataGaps: [],
        },
        goalAssessment: {
          surveyObjective: "",
          achievementScore: 0,
          achievementLevel: "not_met",
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
        conversationCount: totalCount,
        lastUpdated: new Date().toISOString(),
        dashboardWidgets: [],
      };

      partialAnalytics.dashboardWidgets =
        createDashboardWidgets(partialAnalytics);

      if (format === "widgets") {
        return NextResponse.json({
          status: "ready",
          surveyId,
          lastUpdated: partialAnalytics.lastUpdated,
          widgets: partialAnalytics.dashboardWidgets,
        });
      }

      return NextResponse.json({ status: "ready", ...partialAnalytics });
    }

    const storedMetrics = analytics.metrics as Partial<SurveyAnalyticsData>;

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
        medianActiveDurationMinutes: 0,
        insightQualityScore: 5,
        responseEngagementDistribution: { high: 0, medium: 0, low: 0 },
        requiredQuestionsCompletion: [],
        topicCoverageRate: 0,
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

    if (regenerateWidgets || !storedMetrics.dashboardWidgets) {
      analyticsData.dashboardWidgets = createDashboardWidgets(analyticsData);
    } else {
      analyticsData.dashboardWidgets =
        storedMetrics.dashboardWidgets as DashboardWidget[];
    }

    if (format === "widgets") {
      return NextResponse.json({
        status: "ready",
        surveyId,
        lastUpdated: analytics.lastUpdated,
        widgets: analyticsData.dashboardWidgets,
      });
    }

    return NextResponse.json({ status: "ready", ...analyticsData });
  } catch (error) {
    console.error("[Analytics API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/surveys/[surveyId]/analytics
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
    const access = await getSurveyAccessLevel(session.user.id, surveyId);

    const canManage = access === "owner" || access === "editor";
    if (!canManage) {
      return NextResponse.json(
        {
          error: "Unauthorized. Only owners and editors can trigger analytics.",
        },
        { status: 403 },
      );
    }

    const conversations = await getDb()
      .select({
        id: surveyConversations.id,
        summary: surveyConversations.summary,
      })
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId));

    const completedWithInsights = conversations.filter((c) => c.summary);

    if (completedWithInsights.length === 0) {
      return NextResponse.json(
        { error: "No completed conversations with insights found." },
        { status: 400 },
      );
    }

    if (!force) {
      const [existingAnalytics] = await getDb()
        .select()
        .from(surveyAnalytics)
        .where(eq(surveyAnalytics.surveyId, surveyId));

      if (existingAnalytics?.lastUpdated) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (existingAnalytics.lastUpdated > fiveMinutesAgo) {
          return NextResponse.json({
            status: "recent_exists",
            lastUpdated: existingAnalytics.lastUpdated,
          });
        }
      }
    }

    const { enqueueSurveyAnalytics } = await import("@/lib/queue");
    const { resetAnalyticsCounterAfterGeneration } =
      await import("@/lib/analytics-scheduler");

    await resetAnalyticsCounterAfterGeneration(surveyId);

    const job = await enqueueSurveyAnalytics({
      surveyId,
      userId: session.user.id,
    });

    return NextResponse.json({ status: "generating", jobId: job.id });
  } catch (error) {
    console.error("[Analytics API] Error:", error);
    return NextResponse.json(
      { error: "Failed to trigger analytics generation" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/surveys/[surveyId]/analytics/conversations
 */
export async function getConversationInsights(
  surveyId: string,
  userId: string,
): Promise<ConversationInsightData[]> {
  const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
  const access = await getSurveyAccessLevel(userId, surveyId);

  if (access === "none") {
    throw new Error("Unauthorized");
  }

  const conversations = await getDb()
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
      eq(conversationInsights.conversationId, surveyConversations.id),
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
        activeDurationMinutes: (stored.activeDurationMinutes as number) || 0,
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
        respondentData: (stored.respondentData as Record<string, string>) || {},
        mediaInteractions:
          (stored.mediaInteractions as ConversationInsightData["mediaInteractions"]) ||
          [],
      };
    });
}
