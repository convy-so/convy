import { and, count, desc, eq, sql } from "drizzle-orm";

import { env } from "@/shared/config/server-env";
import { getDb } from "@/shared/db";
import { surveyBriefs, surveyConversations, surveys } from "@/shared/db/schema";
import type { AuthSessionWithUser } from "@/features/auth/public-server";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import type { SurveyDetailsResponse } from "@/features/surveys/client/api/surveys-api";
import { normalizeSurveyDeliveryMode } from "@/shared/surveys/constants";

type SurveySession = Pick<AuthSessionWithUser, "user">;

export async function getSurveyDetailsViewModel(
  surveyId: string,
  session: SurveySession,
): Promise<SurveyDetailsResponse> {
  const [survey, briefRow] = await Promise.all([
    getDb().query.surveys.findFirst({
      where: eq(surveys.id, surveyId),
      with: {
        classroom: {
          columns: {
            title: true,
          },
        },
      },
    }),
    getDb()
      .select()
      .from(surveyBriefs)
      .where(eq(surveyBriefs.surveyId, surveyId))
      .then((rows) => rows[0]),
  ]);

  if (!survey) {
    throw new Error("Survey not found");
  }

  const permission = await getSurveyPermissionForSession(session, survey.id);
  if (!hasSurveyPermission(permission, "canView")) {
    throw new Error("Unauthorized");
  }

  const [stats, completedStats, recentResponses, durationStats] = await Promise.all([
    getDb()
      .select({
        totalResponses: count(surveyConversations.id),
      })
      .from(surveyConversations)
      .where(
        and(
          eq(surveyConversations.surveyId, surveyId),
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${surveyConversations.rawConversation}) as msg
            WHERE msg->>'role' = 'user'
          )`,
        ),
      )
      .then((rows) => rows[0]),
    getDb()
      .select({
        count: count(surveyConversations.id),
      })
      .from(surveyConversations)
      .where(
        and(
          eq(surveyConversations.surveyId, surveyId),
          eq(surveyConversations.completed, true),
        ),
      )
      .then((rows) => rows[0]),
    getDb()
      .select({
        id: surveyConversations.id,
        participantId: surveyConversations.participantId,
        completed: surveyConversations.completed,
        createdAt: surveyConversations.createdAt,
        updatedAt: surveyConversations.updatedAt,
      })
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId))
      .orderBy(desc(surveyConversations.createdAt))
      .limit(10),
    getDb()
      .select({
        avgDuration: sql<number>`avg(${surveyConversations.durationMs})`,
      })
      .from(surveyConversations)
      .where(
        and(
          eq(surveyConversations.surveyId, surveyId),
          eq(surveyConversations.completed, true),
          sql`${surveyConversations.durationMs} > 0`,
        ),
      )
      .then((rows) => rows[0]),
  ]);

  const totalResponses = stats?.totalResponses || 0;
  const completedResponses = completedStats?.count || 0;
  const completionRate =
    totalResponses > 0
      ? Math.round((completedResponses / totalResponses) * 100)
      : 0;

  const avgDurationMs = Math.round(Number(durationStats?.avgDuration) || 0);
  let avgDurationDisplay = "0 min";
  if (avgDurationMs > 0) {
    if (avgDurationMs < 60000) {
      avgDurationDisplay = `${Math.round(avgDurationMs / 1000)}s`;
    } else {
      const minutes = Math.round(avgDurationMs / 60000);
      avgDurationDisplay = minutes === 0 ? "< 1 min" : `${minutes} min`;
    }
  }

  const publicIdentifier = survey.customSlug ?? survey.shareableLink;
  const shareableUrl = publicIdentifier
    ? `${env.APP_BASE_URL}/s/${publicIdentifier}`
    : null;

  return {
    survey: {
      id: survey.id,
      title: survey.title,
      status: survey.status,
      description: survey.description,
      createdAt: survey.createdAt,
      updatedAt: survey.updatedAt,
      coreObjective: survey.coreObjective,
      programId: survey.programId,
      brief: briefRow?.brief || null,
      tone: survey.tone,
      customSlug: survey.customSlug,
      shareableLink: survey.shareableLink,
      shareableUrl,
      participantLimit: survey.participantLimit,
      currentParticipants: survey.currentParticipants,
      requiredQuestions: survey.requiredQuestions,
      metrics: survey.metrics,
      language: survey.language,
      isVoice: survey.isVoice,
      media: survey.media,
      sampleConversationCount: survey.sampleConversationCount,
      userId: survey.userId,
      deliveryMode: normalizeSurveyDeliveryMode(survey.deliveryMode),
      classroomId: survey.classroomId,
      classroomTitle: survey.classroom?.title ?? null,
      editors: [],
      permission,
    },
    stats: {
      totalResponses,
      completedResponses,
      completionRate,
      avgDuration: avgDurationDisplay,
    },
    recentResponses: recentResponses.map((response) => ({
      id: response.id,
      participantId: response.participantId,
      completed: response.completed,
      completedAt: response.completed ? response.updatedAt?.toISOString() : null,
      createdAt: response.createdAt?.toISOString(),
    })),
  };
}
