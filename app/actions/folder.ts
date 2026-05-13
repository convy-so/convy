"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { folders, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
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
