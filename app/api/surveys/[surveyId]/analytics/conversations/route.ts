import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  surveys,
  surveyConversations,
  conversationInsights,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import type { ConversationInsightData } from "@/lib/analytics";

/**
 * GET /api/surveys/[surveyId]/analytics/conversations
 *
 * Returns individual conversation insights for drill-down analysis.
 *
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - sortBy: "date" | "engagement" | "quality" (default: "date")
 * - sortOrder: "asc" | "desc" (default: "desc")
 * - engagementFilter: "high" | "medium" | "low" | "all" (default: "all")
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { searchParams } = new URL(request.url);

    // Parse query params
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20"))
    );
    const sortBy = searchParams.get("sortBy") || "date";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const engagementFilter = searchParams.get("engagementFilter") || "all";

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

    // Fetch all conversations with insights
    const allConversations = await db
      .select({
        id: surveyConversations.id,
        createdAt: surveyConversations.createdAt,
        summary: surveyConversations.summary,
        completed: surveyConversations.completed,
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

    // Transform to structured format
    let transformedConversations = allConversations
      .filter((c) => c.completed && c.summary)
      .map((c) => {
        const stored = (c.insights as Record<string, unknown>) || {};

        const insightData: ConversationInsightData & { createdAt: Date } = {
          conversationId: c.id,
          createdAt: c.createdAt,
          summary: (stored.summary as string) || c.summary || "",
          keyFindings: c.keyFindings?.split("\n\n") || [],
          messageCount:
            (stored.messageCount as number) || c.rawConversation?.length || 0,
          participantResponseCount:
            (stored.participantResponseCount as number) ||
            c.rawConversation?.filter((m) => m.role === "user").length ||
            0,
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
        };

        return insightData;
      });

    // Apply engagement filter
    if (engagementFilter !== "all") {
      transformedConversations = transformedConversations.filter(
        (c) => c.engagementLevel === engagementFilter
      );
    }

    // Sort
    transformedConversations.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "engagement":
          const engagementOrder = { high: 3, medium: 2, low: 1 };
          comparison =
            engagementOrder[a.engagementLevel] -
            engagementOrder[b.engagementLevel];
          break;
        case "quality":
          comparison = a.responseQuality - b.responseQuality;
          break;
        case "date":
        default:
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });

    // Paginate
    const totalCount = transformedConversations.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const paginatedConversations = transformedConversations.slice(
      startIndex,
      startIndex + limit
    );

    // Calculate aggregate stats
    const aggregateStats = {
      totalConversations: totalCount,
      byEngagement: {
        high: transformedConversations.filter(
          (c) => c.engagementLevel === "high"
        ).length,
        medium: transformedConversations.filter(
          (c) => c.engagementLevel === "medium"
        ).length,
        low: transformedConversations.filter((c) => c.engagementLevel === "low")
          .length,
      },
      averageQuality:
        totalCount > 0
          ? Math.round(
              (transformedConversations.reduce(
                (sum, c) => sum + c.responseQuality,
                0
              ) /
                totalCount) *
                10
            ) / 10
          : 0,
      sentimentBreakdown: {
        positive: transformedConversations.filter(
          (c) => c.sentiment.overall === "positive"
        ).length,
        negative: transformedConversations.filter(
          (c) => c.sentiment.overall === "negative"
        ).length,
        neutral: transformedConversations.filter(
          (c) => c.sentiment.overall === "neutral"
        ).length,
        mixed: transformedConversations.filter(
          (c) => c.sentiment.overall === "mixed"
        ).length,
      },
    };

    return NextResponse.json({
      conversations: paginatedConversations,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      aggregateStats,
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
    console.error("[Conversation Insights API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversation insights" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/surveys/[surveyId]/analytics/conversations/[conversationId]
 *
 * Returns detailed insights for a single conversation.
 * Implemented as a separate function for use by specific conversation routes.
 */
export async function getConversationDetail(
  surveyId: string,
  conversationId: string,
  userId: string
): Promise<ConversationInsightData | null> {
  // Verify survey ownership
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey || survey.userId !== userId) {
    return null;
  }

  // Fetch specific conversation
  const [conversation] = await db
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
    .where(eq(surveyConversations.id, conversationId));

  if (!conversation) {
    return null;
  }

  const stored = (conversation.insights as Record<string, unknown>) || {};

  return {
    conversationId: conversation.id,
    summary: (stored.summary as string) || conversation.summary || "",
    keyFindings: conversation.keyFindings?.split("\n\n") || [],
    messageCount:
      (stored.messageCount as number) ||
      conversation.rawConversation?.length ||
      0,
    participantResponseCount: (stored.participantResponseCount as number) || 0,
    averageResponseLength: (stored.averageResponseLength as number) || 0,
    durationMinutes: (stored.durationMinutes as number) || 0,
    followUpDepth: (stored.followUpDepth as number) || 0,
    engagementLevel:
      (stored.engagementLevel as "high" | "medium" | "low") || "medium",
    responseQuality: (stored.responseQuality as number) || 5,
    topicsCovered: (stored.topicsCovered as string[]) || [],
    requiredQuestionsCovered:
      (stored.requiredQuestionsCovered as string[]) || [],
    requiredQuestionsMissed: (stored.requiredQuestionsMissed as string[]) || [],
    sentiment: (stored.sentiment as ConversationInsightData["sentiment"]) || {
      overall: "neutral",
      score: 0,
      confidence: 0.5,
    },
    extractedMetrics:
      (stored.extractedMetrics as Record<string, string | number | boolean>) ||
      {},
    notableQuotes:
      (stored.notableQuotes as ConversationInsightData["notableQuotes"]) || [],
    hypothesisEvidence:
      (stored.hypothesisEvidence as ConversationInsightData["hypothesisEvidence"]) ||
      [],
  };
}
