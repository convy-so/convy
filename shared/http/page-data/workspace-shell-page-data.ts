import { cache } from "react";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/shared/db";
import {
  folders,
  notifications,
  surveyConversations,
  surveys,
} from "@/shared/db/schema";
import {
  getCurrentSession,
  getVerifiedSession,
} from "@/features/auth/public-server";
import { normalizeAppLocale } from "@/shared/i18n/config";
import type { VerifiedSession } from "@/shared/http/page-data/page-data-context";

type NotificationRecord = typeof notifications.$inferSelect;

type FolderSurveyListItem = {
  id: string;
  title: string | null;
  status: string;
  currentParticipants: number;
  isVoice: boolean;
  createdAt: Date;
  folderId: string | null;
};

type FolderDetailSurveyItem = typeof surveys.$inferSelect & {
  summary: string | null;
  completedCount: number;
};

export async function getNotificationsForSession(
  session: VerifiedSession,
): Promise<NotificationRecord[]> {
  return getDb().query.notifications.findMany({
    where: eq(notifications.userId, session.user.id),
    orderBy: [desc(notifications.createdAt)],
    limit: 20,
  });
}

export const getNotificationsForCurrentUser = cache(async (): Promise<NotificationRecord[]> => {
  const session = await getVerifiedSession();
  return getNotificationsForSession(session);
});

export async function getFolderListData() {
  const session = await getVerifiedSession();

  const [folderRows, folderSurveyRows] = await Promise.all([
    getDb().query.folders.findMany({
      where: eq(folders.userId, session.user.id),
      orderBy: (table, operators) => [operators.asc(table.createdAt)],
    }),
    getDb().query.surveys.findMany({
      where: eq(surveys.userId, session.user.id),
      orderBy: (table, operators) => [operators.desc(table.createdAt)],
    }),
  ]);

  const surveysByFolderId = new Map<string, FolderSurveyListItem[]>();

  for (const survey of folderSurveyRows) {
    if (!survey.folderId) {
      continue;
    }

    const folderSurveys = surveysByFolderId.get(survey.folderId) ?? [];
    folderSurveys.push({
      id: survey.id,
      title: survey.title,
      status: survey.status,
      currentParticipants: survey.currentParticipants,
      isVoice: survey.isVoice,
      createdAt: survey.createdAt,
      folderId: survey.folderId,
    });
    surveysByFolderId.set(survey.folderId, folderSurveys);
  }

  return folderRows.map((folder) => {
    const folderSurveys = surveysByFolderId.get(folder.id) ?? [];
    return {
      ...folder,
      surveyCount: folderSurveys.length,
      totalResponses: folderSurveys.reduce(
        (sum, survey) => sum + survey.currentParticipants,
        0,
      ),
      canEditMetadata: true as const,
      canOrganizeSurveys: true as const,
      canDelete: true as const,
      isSharedFolder: false as const,
      surveys: folderSurveys,
    };
  });
}

export async function getFolderDetailData(folderId: string) {
  const session = await getVerifiedSession();

  const [folder, folderSurveys] = await Promise.all([
    getDb().query.folders.findFirst({
      where: and(eq(folders.id, folderId), eq(folders.userId, session.user.id)),
    }),
    getDb().query.surveys.findMany({
      where: and(eq(surveys.folderId, folderId), eq(surveys.userId, session.user.id)),
      orderBy: (table, operators) => [operators.desc(table.createdAt)],
    }),
  ]);

  if (!folder) {
    throw new Error("Folder not found");
  }

  const completedCounts = folderSurveys.length
    ? await getDb()
        .select({
          surveyId: surveyConversations.surveyId,
          value: count(),
        })
        .from(surveyConversations)
        .where(
          and(
            inArray(
              surveyConversations.surveyId,
              folderSurveys.map((survey) => survey.id),
            ),
            eq(surveyConversations.completed, true),
          ),
        )
        .groupBy(surveyConversations.surveyId)
    : [];

  const completedCountBySurveyId = new Map(
    completedCounts.map((row) => [row.surveyId, row.value]),
  );

  return {
    ...folder,
    canEditMetadata: true as const,
    canOrganizeSurveys: true as const,
    canDelete: true as const,
    isSharedFolder: false as const,
    surveys: folderSurveys.map<FolderDetailSurveyItem>((survey) => ({
      ...survey,
      summary: null,
      completedCount: Number(completedCountBySurveyId.get(survey.id) ?? 0),
    })),
  };
}

export async function getAvailableFolderSurveysData() {
  const session = await getVerifiedSession();

  return getDb().query.surveys.findMany({
    where: and(eq(surveys.userId, session.user.id), isNull(surveys.folderId)),
    orderBy: (table, operators) => [operators.desc(table.createdAt)],
  });
}

export const getCurrentUiLocaleValue = cache(async () => {
  const session = await getCurrentSession();
  return normalizeAppLocale(session?.user.uiLocale ?? session?.user.preferredLanguage);
});
