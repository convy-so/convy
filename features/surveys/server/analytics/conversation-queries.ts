import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/shared/db";
import { surveySessionInsights, surveySessions } from "@/shared/db/schema";
import { conversationInsightSchema } from "@/features/surveys/server/education/types";
import { buildConversationListItem } from "@/features/surveys/server/analytics/dashboard-analytics";

export type ConversationListItem = ReturnType<typeof buildConversationListItem>;

export type ConversationAggregateStats = {
  totalConversations: number;
  completedHighQuality: number;
  flaggedConversations: number;
  averageReliabilityPercent: number;
  averageCompletenessPercent: number;
};

export type PaginatedConversationInsights = {
  conversations: ConversationListItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  aggregateStats: ConversationAggregateStats;
};

const MAX_AGGREGATE_ROWS = 1000;

export async function getConversationInsights(
  surveyId: string,
  page: number,
  limit: number,
): Promise<PaginatedConversationInsights> {
  // Two-query approach: aggregate from a capped set, paginated rows from DB
  const [allRows, paginatedRows] = await Promise.all([
    getDb()
      .select({
        sessionId: surveySessionInsights.sessionId,
        insight: surveySessionInsights.insight,
        createdAt: surveySessions.createdAt,
        sessionType: surveySessions.sessionType,
        sourceConversationId: surveySessions.sourceConversationId,
      })
      .from(surveySessionInsights)
      .innerJoin(
        surveySessions,
        eq(surveySessions.id, surveySessionInsights.sessionId),
      )
      .where(
        and(
          eq(surveySessionInsights.surveyId, surveyId),
          eq(surveySessions.sessionType, "live"),
        ),
      )
      .orderBy(desc(surveySessions.createdAt))
      .limit(MAX_AGGREGATE_ROWS),
    getDb()
      .select({
        sessionId: surveySessionInsights.sessionId,
        insight: surveySessionInsights.insight,
        createdAt: surveySessions.createdAt,
        sessionType: surveySessions.sessionType,
        sourceConversationId: surveySessions.sourceConversationId,
      })
      .from(surveySessionInsights)
      .innerJoin(
        surveySessions,
        eq(surveySessions.id, surveySessionInsights.sessionId),
      )
      .where(
        and(
          eq(surveySessionInsights.surveyId, surveyId),
          eq(surveySessions.sessionType, "live"),
        ),
      )
      .orderBy(desc(surveySessions.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);

  const allItems = allRows.flatMap((row) => {
    const parsed = conversationInsightSchema.safeParse(row.insight);
    if (!parsed.success) return [];
    return [
      buildConversationListItem({
        insight: parsed.data,
        createdAt: row.createdAt,
        sessionType: row.sessionType,
        sourceConversationId: row.sourceConversationId,
      }),
    ];
  });

  const paginatedItems = paginatedRows.flatMap((row) => {
    const parsed = conversationInsightSchema.safeParse(row.insight);
    if (!parsed.success) return [];
    return [
      buildConversationListItem({
        insight: parsed.data,
        createdAt: row.createdAt,
        sessionType: row.sessionType,
        sourceConversationId: row.sourceConversationId,
      }),
    ];
  });

  const totalCount = allItems.length;
  const completedHighQuality = allItems.filter(
    (item) =>
      item.completenessPercent >= 80 && item.reliabilityPercent >= 65,
  ).length;
  const flaggedConversations = allItems.filter(
    (item) => item.reliabilityPercent < 55,
  ).length;
  const averageReliabilityPercent =
    totalCount > 0
      ? Math.round(
          allItems.reduce((sum, item) => sum + item.reliabilityPercent, 0) /
            totalCount,
        )
      : 0;
  const averageCompletenessPercent =
    totalCount > 0
      ? Math.round(
          allItems.reduce((sum, item) => sum + item.completenessPercent, 0) /
            totalCount,
        )
      : 0;

  return {
    conversations: paginatedItems,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      hasNextPage: page * limit < totalCount,
      hasPreviousPage: page > 1,
    },
    aggregateStats: {
      totalConversations: totalCount,
      completedHighQuality,
      flaggedConversations,
      averageReliabilityPercent,
      averageCompletenessPercent,
    },
  };
}

export async function getConversationInsightsSummary(
  surveyId: string,
  limit = 50,
): Promise<{
  conversations: ConversationListItem[];
  stats: {
    total: number;
    highQuality: number;
    averageReliability: number;
  };
}> {
  const rows = await getDb()
    .select({
      sessionId: surveySessionInsights.sessionId,
      insight: surveySessionInsights.insight,
      createdAt: surveySessions.createdAt,
      sessionType: surveySessions.sessionType,
      sourceConversationId: surveySessions.sourceConversationId,
    })
    .from(surveySessionInsights)
    .innerJoin(
      surveySessions,
      eq(surveySessions.id, surveySessionInsights.sessionId),
    )
    .where(
      and(
        eq(surveySessionInsights.surveyId, surveyId),
        eq(surveySessions.sessionType, "live"),
      ),
    )
    .orderBy(desc(surveySessions.createdAt))
    .limit(limit);

  const conversations = rows.flatMap((row) => {
    const parsed = conversationInsightSchema.safeParse(row.insight);
    if (!parsed.success) return [];
    return [
      buildConversationListItem({
        insight: parsed.data,
        createdAt: row.createdAt,
        sessionType: row.sessionType,
        sourceConversationId: row.sourceConversationId,
      }),
    ];
  });

  const total = conversations.length;
  const highQuality = conversations.filter(
    (c) => c.completenessPercent >= 80 && c.reliabilityPercent >= 65,
  ).length;
  const averageReliability =
    total > 0
      ? Math.round(
          conversations.reduce((sum, c) => sum + c.reliabilityPercent, 0) /
            total,
        )
      : 0;

  return { conversations, stats: { total, highQuality, averageReliability } };
}
