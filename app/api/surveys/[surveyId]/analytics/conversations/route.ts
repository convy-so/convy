import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveySessionInsights, surveySessions } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  buildConversationListItem,
  translateConversationListItems,
} from "@/lib/analytics";
import { conversationInsightSchema } from "@/lib/education/types";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";
import { getUserPreferredLanguage } from "@/lib/translation-service";
import { normalizeAppLocale } from "@/lib/i18n/config";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const viewerLanguage = normalizeAppLocale(
      searchParams.get("language") ??
        (await getUserPreferredLanguage(session.user.id).catch(() => "en")),
    );

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canView")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const rows = await getDb()
      .select({
        sessionId: surveySessionInsights.sessionId,
        insight: surveySessionInsights.insight,
        createdAt: surveySessions.createdAt,
        sessionType: surveySessions.sessionType,
        sourceConversationId: surveySessions.sourceConversationId,
      })
      .from(surveySessionInsights)
      .innerJoin(surveySessions, eq(surveySessions.id, surveySessionInsights.sessionId))
      .where(
        and(
          eq(surveySessionInsights.surveyId, surveyId),
          eq(surveySessions.sessionType, "live"),
        ),
      );

    const totalCount = rows.length;
    const conversationItems = rows.flatMap((row) => {
      const parsedInsight = conversationInsightSchema.safeParse(row.insight);

      if (!parsedInsight.success) {
        return [];
      }

      return [
        buildConversationListItem({
          insight: parsedInsight.data,
          createdAt: row.createdAt,
          sessionType: row.sessionType,
          sourceConversationId: row.sourceConversationId,
        }),
      ];
    });
    const paginated = await translateConversationListItems(
      conversationItems.slice((page - 1) * limit, page * limit),
      viewerLanguage,
      {
        userId: session.user.id,
        surveyId,
      },
    );
    const completedHighQuality = conversationItems.filter(
      (item) => item.completenessPercent >= 80 && item.reliabilityPercent >= 65,
    ).length;
    const flaggedConversations = conversationItems.filter(
      (item) => item.reliabilityPercent < 55,
    ).length;
    const averageReliabilityPercent =
      totalCount > 0
        ? Math.round(
            conversationItems.reduce(
              (sum, item) => sum + item.reliabilityPercent,
              0,
            ) / totalCount,
          )
        : 0;
    const averageCompletenessPercent =
      totalCount > 0
        ? Math.round(
            conversationItems.reduce(
              (sum, item) => sum + item.completenessPercent,
              0,
            ) / totalCount,
          )
        : 0;

    return NextResponse.json({
      conversations: paginated,
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
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[Analytics Conversations API] Error:", error);
    return NextResponse.json({ error: "Failed to fetch conversation insights" }, { status: 500 });
  }
}
