"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { and, count, eq, getTableColumns, sum } from "drizzle-orm";

import { getDb } from "@/db";
import { folders, surveys, surveyConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { invalidateDashboardCaches } from "@/lib/cache";

import {
  withErrorHandling,
  ActionResult,
  validateInput,
  ActionError
} from "@/lib/action-wrapper";

const createFolderSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const updateFolderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

type FolderPermissions = {
  canEditMetadata: true;
  canOrganizeSurveys: true;
  canDelete: true;
  isSharedFolder: false;
};

type FolderListRow = typeof folders.$inferSelect & {
  surveyCount: number;
  totalResponses: number;
};

type FolderSurveySummary = typeof surveys.$inferSelect & {
  summary: string | null;
  completedCount: number;
};

type FolderListItem = FolderListRow & FolderPermissions;
type FolderDetail = typeof folders.$inferSelect &
  FolderPermissions & {
    surveys: FolderSurveySummary[];
  };

const personalFolderPermissions: FolderPermissions = {
  canEditMetadata: true,
  canOrganizeSurveys: true,
  canDelete: true,
  isSharedFolder: false,
};

async function requireOwnedFolder(userId: string, folderId: string) {
  const [folder] = await getDb()
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)));

  return folder ?? null;
}

export async function createFolderAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    const body = validateInput(input, createFolderSchema);
    const folderId = nanoid();

    await getDb().insert(folders).values({
      id: folderId,
      userId: session.user.id,
      name: body.name,
      description: body.description,
      color: body.color,
      icon: body.icon,
    });

    await invalidateDashboardCaches(session.user.id, null, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: { id: folderId } };
  }, "createFolderAction");
}

export async function getFoldersAction(): Promise<ActionResult<FolderListItem[]>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();

    const folderList = await getDb()
      .select({
        ...getTableColumns(folders),
        surveyCount: count(surveys.id),
        totalResponses: sum(surveys.currentParticipants),
      })
      .from(folders)
      .leftJoin(surveys, eq(folders.id, surveys.folderId))
      .where(eq(folders.userId, session.user.id))
      .groupBy(folders.id)
      .orderBy(folders.createdAt);

    return {
      success: true,
      data: folderList.map((folder) => ({
        ...folder,
        surveyCount: Number(folder.surveyCount),
        totalResponses: Number(folder.totalResponses || 0),
        ...personalFolderPermissions,
      })),
    };
  }, "getFoldersAction");
}

export async function getFolderAction(id: string): Promise<ActionResult<FolderDetail>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    const folder = await requireOwnedFolder(session.user.id, id);

    if (!folder) {
      throw new ActionError("Folder not found", "NOT_FOUND");
    }

    const folderSurveys = await getDb()
      .select({
        ...getTableColumns(surveys),
        completedCount: count(surveyConversations.id),
      })
      .from(surveys)
      .leftJoin(
        surveyConversations,
        and(
          eq(surveyConversations.surveyId, surveys.id),
          eq(surveyConversations.completed, true),
        ),
      )
      .where(and(eq(surveys.folderId, id), eq(surveys.userId, session.user.id)))
      .groupBy(surveys.id);

    return {
      success: true,
      data: {
        ...folder,
        ...personalFolderPermissions,
        surveys: folderSurveys.map((survey) => ({
          ...survey,
          summary: null,
          completedCount: Number(survey.completedCount),
        })),
      },
    };
  }, "getFolderAction");
}

export async function addSurveyToFolderAction(
  folderId: string,
  surveyId: string,
): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    const folder = await requireOwnedFolder(session.user.id, folderId);

    if (!folder) {
      throw new ActionError("Folder not found", "NOT_FOUND");
    }

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(and(eq(surveys.id, surveyId), eq(surveys.userId, session.user.id)));

    if (!survey) {
      throw new ActionError("Survey not found", "NOT_FOUND");
    }

    await getDb()
      .update(surveys)
      .set({ folderId })
      .where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, null, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: undefined };
  }, "addSurveyToFolderAction");
}

export async function removeSurveyFromFolderAction(
  folderId: string,
  surveyId: string,
): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    const folder = await requireOwnedFolder(session.user.id, folderId);

    if (!folder) {
      throw new ActionError("Folder not found", "NOT_FOUND");
    }

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(
        and(
          eq(surveys.id, surveyId),
          eq(surveys.folderId, folderId),
          eq(surveys.userId, session.user.id),
        ),
      );

    if (!survey) {
      throw new ActionError("Survey not found in this folder", "NOT_FOUND");
    }

    await getDb()
      .update(surveys)
      .set({ folderId: null })
      .where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, null, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: undefined };
  }, "removeSurveyFromFolderAction");
}

export async function updateFolderAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    const body = validateInput(input, updateFolderSchema);
    const folder = await requireOwnedFolder(session.user.id, body.id);

    if (!folder) {
      throw new ActionError("Folder not found", "NOT_FOUND");
    }

    const updateData: Partial<typeof folders.$inferInsert> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.icon !== undefined) updateData.icon = body.icon;

    await getDb()
      .update(folders)
      .set(updateData)
      .where(eq(folders.id, body.id));

    await invalidateDashboardCaches(session.user.id, null, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: { id: body.id } };
  }, "updateFolderAction");
}

export async function deleteFolderAction(
  id: string,
): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    const folder = await requireOwnedFolder(session.user.id, id);

    if (!folder) {
      throw new ActionError("Folder not found", "NOT_FOUND");
    }

    await getDb().transaction(async (tx) => {
      await tx
        .update(surveys)
        .set({ folderId: null })
        .where(eq(surveys.folderId, id));

      await tx.delete(folders).where(eq(folders.id, id));
    });

    await invalidateDashboardCaches(session.user.id, null, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: undefined };
  }, "deleteFolderAction");
}
