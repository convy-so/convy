"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { eq, and, isNull, count, sum, getTableColumns } from "drizzle-orm";

import { getDb } from "@/db";
import { folders, surveys, surveyConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyPermissionContext,
  hasSurveyPermission,
  isWorkspaceMember,
  isWorkspaceOwner,
} from "@/lib/workspace-access";
import { invalidateDashboardCaches } from "@/lib/cache";
import {
  recordRealtimeEvent,
} from "@/lib/collaboration-service";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const createFolderSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

type FolderListRow = typeof folders.$inferSelect & {
  surveyCount: number;
  totalResponses: number;
};

type FolderSurveySummary = typeof surveys.$inferSelect & {
  summary: string | null;
  completedCount: number;
};

type FolderPermissions = {
  canEditMetadata: boolean;
  canOrganizeSurveys: boolean;
  canDelete: boolean;
  isSharedWorkspaceFolder: boolean;
};

type FolderListItem = FolderListRow & FolderPermissions;
type FolderDetail = typeof folders.$inferSelect &
  FolderPermissions & {
    surveys: FolderSurveySummary[];
  };

async function getFolderPermissions(
  folder: typeof folders.$inferSelect,
  userId: string,
): Promise<FolderPermissions> {
  if (!folder.organizationId) {
    const isOwner = folder.userId === userId;
    return {
      canEditMetadata: isOwner,
      canOrganizeSurveys: isOwner,
      canDelete: isOwner,
      isSharedWorkspaceFolder: false,
    };
  }

  const [member, owner] = await Promise.all([
    isWorkspaceMember(userId, folder.organizationId),
    isWorkspaceOwner(userId, folder.organizationId),
  ]);
  const isFolderOwner = folder.userId === userId;

  return {
    canEditMetadata: isFolderOwner || owner,
    canOrganizeSurveys: member,
    canDelete: isFolderOwner || owner,
    isSharedWorkspaceFolder: member && !isFolderOwner,
  };
}

export async function createFolderAction(
  input: z.infer<typeof createFolderSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();
    const body = createFolderSchema.parse(input);
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      // Check if user is member
      const isMember = await isWorkspaceMember(session.user.id, activeOrgId);
      if (!isMember) {
        return { success: false, error: "Unauthorized" };
      }
    }

    const folderId = nanoid();

    await getDb().transaction(async (tx) => {
      await tx.insert(folders).values({
        id: folderId,
        userId: session.user.id,
        organizationId: activeOrgId,
        name: body.name,
        description: body.description,
        color: body.color,
        icon: body.icon,
      });

      if (activeOrgId) {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: activeOrgId,
          eventType: "workspace.folder_created",
          actorId: session.user.id,
          payload: {
            workspaceId: activeOrgId,
            folder: {
              id: folderId,
              name: body.name,
              description: body.description ?? null,
              color: body.color ?? null,
              icon: body.icon ?? null,
              userId: session.user.id,
            },
          },
        });
      }
    });

    await invalidateDashboardCaches(session.user.id, activeOrgId, [
      "stats",
      "recentSurveys",
    ]);



    return { success: true, data: { id: folderId } };
  } catch (error) {
    console.error("[createFolderAction] Failed:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create folder" };
  }
}

export async function getFoldersAction(): Promise<
  ActionResult<FolderListItem[]>
> {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      const isMember = await isWorkspaceMember(session.user.id, activeOrgId);
      if (!isMember) {
        return { success: false, error: "Unauthorized" };
      }

      const folderList = await getDb()
        .select({
          ...getTableColumns(folders),
          surveyCount: count(surveys.id),
          totalResponses: sum(surveys.currentParticipants),
        })
        .from(folders)
        .leftJoin(surveys, eq(folders.id, surveys.folderId))
        .where(
          and(
            eq(folders.organizationId, activeOrgId),
          ),
        )
        .groupBy(folders.id)
        .orderBy(folders.createdAt);

      const results = await Promise.all(
        folderList.map(async (folder) => ({
          ...folder,
          surveyCount: Number(folder.surveyCount),
          totalResponses: Number(folder.totalResponses || 0),
          ...(await getFolderPermissions(folder, session.user.id)),
        })),
      );

      return { success: true, data: results };
    } else {
      const folderList = await getDb()
        .select({
          ...getTableColumns(folders),
          surveyCount: count(surveys.id),
          totalResponses: sum(surveys.currentParticipants),
        })
        .from(folders)
        .leftJoin(surveys, eq(folders.id, surveys.folderId))
        .where(
          and(
            eq(folders.userId, session.user.id),
            isNull(folders.organizationId),
          ),
        )
        .groupBy(folders.id)
        .orderBy(folders.createdAt);

      const results = await Promise.all(
        folderList.map(async (folder) => ({
          ...folder,
          surveyCount: Number(folder.surveyCount),
          totalResponses: Number(folder.totalResponses || 0),
          ...(await getFolderPermissions(folder, session.user.id)),
        })),
      );

      return { success: true, data: results };
    }
  } catch (error) {
    console.error("Error fetching folders:", error);
    return { success: false, error: "Failed to fetch folders" };
  }
}

export async function getFolderAction(id: string): Promise<ActionResult<FolderDetail>> {
  try {
    const session = await getVerifiedSession();

    const [folder] = await getDb()
      .select()
      .from(folders)
      .where(eq(folders.id, id));

    if (!folder) {
      return { success: false, error: "Folder not found" };
    }

    if (folder.organizationId) {
      const isMember = await isWorkspaceMember(
        session.user.id,
        folder.organizationId,
      );
      if (!isMember) {
        return { success: false, error: "Unauthorized" };
      }
    } else if (folder.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
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
      .where(eq(surveys.folderId, id))
      .groupBy(surveys.id);

    // We add a summary field to match the frontend expectations if needed,
    // or just return the surveys as is. The frontend type expectations
    // might need to be adjusted or mapped.
    // For now, returning surveys directly.

    return {
      success: true,
      data: {
        ...folder,
        ...(await getFolderPermissions(folder, session.user.id)),
        surveys: folderSurveys.map((s) => ({
          ...s,
          summary: null, // Placeholder if needed, or derived from analytics
          completedCount: Number(s.completedCount),
        })),
      },
    };
  } catch (error) {
    console.error("Error fetching folder:", error);
    return { success: false, error: "Failed to fetch folder" };
  }
}

export async function addSurveyToFolderAction(
  folderId: string,
  surveyId: string,
): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();

    // 1. Verify folder access
    const [folder] = await getDb()
      .select()
      .from(folders)
      .where(eq(folders.id, folderId));

    if (!folder) {
      return { success: false, error: "Folder not found" };
    }

    if (folder.organizationId) {
      const isMember = await isWorkspaceMember(
        session.user.id,
        folder.organizationId,
      );
      if (!isMember) {
        return { success: false, error: "Unauthorized access to folder" };
      }
    } else if (folder.userId !== session.user.id) {
      return { success: false, error: "Unauthorized access to folder" };
    }

    // 2. Verify survey access
    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    // Check if survey belongs to same org/user context
    if (folder.organizationId) {
      if (survey.organizationId !== folder.organizationId) {
        return {
          success: false,
          error: "Survey belongs to a different workspace",
        };
      }

      const permission = await getSurveyPermissionContext(
        session.user.id,
        survey.id,
        { activeWorkspaceId: folder.organizationId },
      );
      if (!hasSurveyPermission(permission, "canEdit")) {
        return {
          success: false,
          error: "You need edit access to organize this survey",
        };
      }
    } else {
      if (survey.userId !== session.user.id || survey.organizationId) {
        return { success: false, error: "Unauthorized access to survey" };
      }
    }

    // 3. Update survey
    await getDb()
      .update(surveys)
      .set({ folderId: folderId })
      .where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, folder.organizationId, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error adding survey to folder:", error);
    return { success: false, error: "Failed to add survey to folder" };
  }
}

export async function removeSurveyFromFolderAction(
  folderId: string,
  surveyId: string,
): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();

    // 1. Verify folder access (mostly to ensure user has right to modify this folder content)
    const [folder] = await getDb()
      .select()
      .from(folders)
      .where(eq(folders.id, folderId));

    if (!folder) {
      // Even if folder doesn't exist, if we are just removing the link from survey,
      // we mainly need to check survey access. But for consistency, let's enforce folder existence verification
      // or just verify survey access is enough?
      // Let's stick to verifying folder access to be safe.
      return { success: false, error: "Folder not found" };
    }

    if (folder.organizationId) {
      const isMember = await isWorkspaceMember(
        session.user.id,
        folder.organizationId,
      );
      if (!isMember) {
        return { success: false, error: "Unauthorized access to folder" };
      }
    } else if (folder.userId !== session.user.id) {
      return { success: false, error: "Unauthorized access to folder" };
    }

    // 2. Verify survey is indeed in this folder
    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(and(eq(surveys.id, surveyId), eq(surveys.folderId, folderId)));

    if (!survey) {
      // Survey not in this folder or doesn't exist
      return { success: false, error: "Survey not found in this folder" };
    }

    if (folder.organizationId) {
      const permission = await getSurveyPermissionContext(
        session.user.id,
        survey.id,
        { activeWorkspaceId: folder.organizationId },
      );
      if (!hasSurveyPermission(permission, "canEdit")) {
        return {
          success: false,
          error: "You need edit access to reorganize this survey",
        };
      }
    }

    // 3. Update survey
    await getDb()
      .update(surveys)
      .set({ folderId: null })
      .where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, folder.organizationId, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error removing survey from folder:", error);
    return { success: false, error: "Failed to remove survey from folder" };
  }
}

const updateFolderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

export async function updateFolderAction(
  input: z.infer<typeof updateFolderSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();
    const body = updateFolderSchema.parse(input);

    const [folder] = await getDb()
      .select()
      .from(folders)
      .where(eq(folders.id, body.id));

    if (!folder) {
      return { success: false, error: "Folder not found" };
    }
    if (folder.organizationId) {
      const canEditMetadata = await isWorkspaceOwner(
        session.user.id,
        folder.organizationId,
      );
      if (!canEditMetadata && folder.userId !== session.user.id) {
        return { success: false, error: "Unauthorized" };
      }
    } else if (folder.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    const updateData: Partial<typeof folders.$inferInsert> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.icon !== undefined) updateData.icon = body.icon;

    await getDb().transaction(async (tx) => {
      await tx
        .update(folders)
        .set(updateData)
        .where(eq(folders.id, body.id));

      if (folder.organizationId) {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: folder.organizationId,
          eventType: "workspace.folder_updated",
          actorId: session.user.id,
          payload: {
            workspaceId: folder.organizationId,
            folder: {
              id: body.id,
              ...updateData,
            },
          },
        });
      }
    });

    await invalidateDashboardCaches(session.user.id, folder.organizationId, [
      "stats",
      "recentSurveys",
    ]);



    return { success: true, data: { id: body.id } };
  } catch (error) {
    console.error("[updateFolderAction] Failed:", error);
    return { success: false, error: "Failed to update folder" };
  }
}

export async function deleteFolderAction(
  id: string,
): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();

    const [folder] = await getDb()
      .select()
      .from(folders)
      .where(eq(folders.id, id));

    if (!folder) {
      return { success: false, error: "Folder not found" };
    }

    if (folder.organizationId) {
      const canDelete = await isWorkspaceOwner(
        session.user.id,
        folder.organizationId,
      );
      if (!canDelete && folder.userId !== session.user.id) {
        return { success: false, error: "Unauthorized" };
      }
    } else if (folder.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    await getDb().transaction(async (tx) => {
      await tx
        .update(surveys)
        .set({ folderId: null })
        .where(eq(surveys.folderId, id));

      await tx.delete(folders).where(eq(folders.id, id));

      if (folder.organizationId) {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: folder.organizationId,
          eventType: "workspace.folder_deleted",
          actorId: session.user.id,
          payload: {
            workspaceId: folder.organizationId,
            folderId: id,
          },
        });
      }
    });

    await invalidateDashboardCaches(session.user.id, folder.organizationId, [
      "stats",
      "recentSurveys",
    ]);



    return { success: true, data: undefined };
  } catch (error) {
    console.error("[deleteFolderAction] Failed:", error);
    return { success: false, error: "Failed to delete folder" };
  }
}

export async function transferFolderOwnershipAction(input: {
  folderId: string;
  newOwnerUserId: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();

    const [folder] = await getDb()
      .select()
      .from(folders)
      .where(eq(folders.id, input.folderId));

    if (!folder) {
      return { success: false, error: "Folder not found" };
    }

    if (!folder.organizationId) {
      return {
        success: false,
        error: "Folder ownership transfer is only supported in workspaces",
      };
    }

    const isMember = await isWorkspaceMember(
      input.newOwnerUserId,
      folder.organizationId,
    );
    if (!isMember) {
      return {
        success: false,
        error: "New owner must be a member of the workspace",
      };
    }

    if (folder.userId !== session.user.id) {
      const { isWorkspaceOwner } = await import("@/lib/workspace-access");
      const isOwner = await isWorkspaceOwner(
        session.user.id,
        folder.organizationId,
      );
      if (!isOwner) {
        return { success: false, error: "Unauthorized" };
      }
    }

    await getDb().transaction(async (tx) => {
      await tx
        .update(folders)
        .set({ userId: input.newOwnerUserId, updatedAt: new Date() })
        .where(eq(folders.id, input.folderId));

      await recordRealtimeEvent(tx, {
        scope: "workspace",
        workspaceId: folder.organizationId,
        eventType: "workspace.folder_updated",
        actorId: session.user.id,
        payload: {
          workspaceId: folder.organizationId,
          folder: {
            id: folder.id,
            userId: input.newOwnerUserId,
          },
        },
      });
    });

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error transferring folder ownership:", error);
    return { success: false, error: "Failed to transfer folder ownership" };
  }
}


