"use server";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb } from "@/db";
import {
  sampleConversations,
  surveyCollaborationComments,
  surveyCreationComments,
  surveyEditorRequests,
  surveyEditors,
  users,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
  getSurveyEditors,
} from "@/lib/workspace-access";
import {
  recordRealtimeEvent,
} from "@/lib/collaboration-service";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const collaboratorSchema = z.object({
  surveyId: z.string().min(1),
  userIdToGrant: z.string().min(1),
});

const commentSchema = z.object({
  surveyId: z.string().min(1),
  text: z.string().min(1),
});

export async function grantEditAccessAction(
  input: z.infer<typeof collaboratorSchema>,
): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();
    const body = collaboratorSchema.parse(input);
    const permission = await getSurveyPermissionForSession(session, body.surveyId);

    if (!permission?.collaborationAllowed) {
      return {
        success: false,
        error: "Collaboration is only available for workspace surveys",
      };
    }
    if (!hasSurveyPermission(permission, "canEdit")) {
      return { success: false, error: "Unauthorized" };
    }
    if (!hasSurveyPermission(permission, "canEdit") || !permission.isSurveyCreator) {
      return { success: false, error: "Only the survey creator can grant access" };
    }

    if (body.userIdToGrant === permission.creatorId) {
      return { success: true, data: undefined };
    }

    if (permission.workspaceId) {
      const { isWorkspaceMember } = await import("@/lib/workspace-access");
      const isMember = await isWorkspaceMember(
        body.userIdToGrant,
        permission.workspaceId,
      );
      if (!isMember) {
        return {
          success: false,
          error: "The invited editor must already be a member of the workspace",
        };
      }
    }

    await getDb().transaction(async (tx) => {
      await tx
        .insert(surveyEditors)
        .values({
          surveyId: body.surveyId,
          userId: body.userIdToGrant,
          grantedBy: session.user.id,
        })
        .onConflictDoNothing();

      await tx
        .update(surveyEditorRequests)
        .set({
          status: "approved",
          resolvedAt: new Date(),
          resolvedBy: session.user.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(surveyEditorRequests.surveyId, body.surveyId),
            eq(surveyEditorRequests.requesterId, body.userIdToGrant),
            eq(surveyEditorRequests.status, "pending"),
          ),
        );

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId: body.surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.editor_request_resolved",
        actorId: session.user.id,
        payload: {
          surveyId: body.surveyId,
          requesterId: body.userIdToGrant,
          status: "approved",
        },
      });

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId: body.surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.editor_granted",
        actorId: session.user.id,
        payload: {
          surveyId: body.surveyId,
          userId: body.userIdToGrant,
          grantedBy: session.user.id,
        },
      });
    });

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error granting edit access:", error);
    return { success: false, error: "Failed to grant access" };
  }
}

export async function revokeEditAccessAction(
  input: z.infer<typeof collaboratorSchema>,
): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();
    const body = collaboratorSchema.parse(input);
    const permission = await getSurveyPermissionForSession(session, body.surveyId);

    if (!permission?.collaborationAllowed) {
      return {
        success: false,
        error: "Collaboration is only available for workspace surveys",
      };
    }
    if (!hasSurveyPermission(permission, "canEdit")) {
      return { success: false, error: "Unauthorized" };
    }
    if (!hasSurveyPermission(permission, "canEdit") || !permission.isSurveyCreator) {
      return { success: false, error: "Only the survey creator can revoke access" };
    }

    await getDb().transaction(async (tx) => {
      await tx
        .delete(surveyEditors)
        .where(
          and(
            eq(surveyEditors.surveyId, body.surveyId),
            eq(surveyEditors.userId, body.userIdToGrant),
          ),
        );

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId: body.surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.editor_revoked",
        actorId: session.user.id,
        payload: {
          surveyId: body.surveyId,
          userId: body.userIdToGrant,
        },
      });
    });

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Error revoking edit access:", error);
    return { success: false, error: "Failed to revoke access" };
  }
}

export async function requestEditAccessAction(
  surveyId: string,
): Promise<ActionResult<{ requestId: string }>> {
  try {
    const session = await getVerifiedSession();
    const permission = await getSurveyPermissionForSession(session, surveyId);

    if (!hasSurveyPermission(permission, "canDiscover")) {
      return { success: false, error: "Unauthorized" };
    }
    if (!permission.collaborationAllowed) {
      return {
        success: false,
        error: "Editor requests are only available for workspace surveys",
      };
    }
    if (permission.canEdit) {
      return { success: false, error: "You already have editor access" };
    }

    const existing = await getDb().query.surveyEditorRequests.findFirst({
      where: and(
        eq(surveyEditorRequests.surveyId, surveyId),
        eq(surveyEditorRequests.requesterId, session.user.id),
        eq(surveyEditorRequests.status, "pending"),
      ),
    });

    if (existing) {
      return { success: true, data: { requestId: existing.id } };
    }

    const requestId = nanoid();
    await getDb().transaction(async (tx) => {
      await tx.insert(surveyEditorRequests).values({
        id: requestId,
        surveyId,
        requesterId: session.user.id,
        status: "pending",
      });

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.editor_request_created",
        actorId: session.user.id,
        payload: {
          surveyId,
          requestId,
          requesterId: session.user.id,
        },
      });
    });

    return { success: true, data: { requestId } };
  } catch (error) {
    console.error("Error requesting edit access:", error);
    return { success: false, error: "Failed to request edit access" };
  }
}

export async function postCreationCommentAction(
  input: z.infer<typeof commentSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();
    const body = commentSchema.parse(input);
    const permission = await getSurveyPermissionForSession(session, body.surveyId);

    if (!hasSurveyPermission(permission, "canComment")) {
      return { success: false, error: "Unauthorized" };
    }
    if (!permission.collaborationAllowed) {
      return {
        success: false,
        error: "Comments are only available for workspace surveys",
      };
    }

    const commentId = nanoid();
    await getDb().transaction(async (tx) => {
      await tx.insert(surveyCollaborationComments).values({
        id: commentId,
        surveyId: body.surveyId,
        contextType: "creation",
        contextId: body.surveyId,
        authorId: session.user.id,
        body: body.text,
      });

      await tx.insert(surveyCreationComments).values({
        id: commentId,
        surveyId: body.surveyId,
        userId: session.user.id,
        text: body.text,
      });

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId: body.surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.comment_added",
        actorId: session.user.id,
        payload: {
          surveyId: body.surveyId,
          comment: {
            id: commentId,
            contextType: "creation",
            contextId: body.surveyId,
            body: body.text,
            authorId: session.user.id,
          },
        },
      });
    });

    return { success: true, data: { id: commentId } };
  } catch (error) {
    console.error("Error posting creation comment:", error);
    return { success: false, error: "Failed to post comment" };
  }
}

export async function getCreationCommentsAction(surveyId: string): Promise<
  ActionResult<
    Array<{
      id: string;
      text: string;
      createdAt: Date;
      user: { name: string; email: string };
    }>
  >
> {
  try {
    const session = await getVerifiedSession();
    const permission = await getSurveyPermissionForSession(session, surveyId);

    if (!hasSurveyPermission(permission, "canView")) {
      return { success: false, error: "Unauthorized" };
    }
    if (!permission.collaborationAllowed) {
      return {
        success: false,
        error: "Comments are only available for workspace surveys",
      };
    }

    const commentsList = await getDb()
      .select({
        id: surveyCollaborationComments.id,
        text: surveyCollaborationComments.body,
        createdAt: surveyCollaborationComments.createdAt,
        user: {
          name: users.name,
          email: users.email,
        },
      })
      .from(surveyCollaborationComments)
      .innerJoin(users, eq(surveyCollaborationComments.authorId, users.id))
      .where(
        and(
          eq(surveyCollaborationComments.surveyId, surveyId),
          eq(surveyCollaborationComments.contextType, "creation"),
          eq(surveyCollaborationComments.contextId, surveyId),
          isNull(surveyCollaborationComments.deletedAt),
        ),
      )
      .orderBy(asc(surveyCollaborationComments.createdAt));

    return { success: true, data: commentsList };
  } catch (error) {
    console.error("Error fetching creation comments:", error);
    return { success: false, error: "Failed to fetch comments" };
  }
}

export async function getSurveyEditorsAction(
  surveyId: string,
): Promise<
  ActionResult<
    Array<{
      userId: string;
      name: string | null;
      email: string;
      grantedAt: Date | null;
    }>
  >
> {
  try {
    const session = await getVerifiedSession();
    const permission = await getSurveyPermissionForSession(session, surveyId);

    if (!hasSurveyPermission(permission, "canView")) {
      return { success: false, error: "Unauthorized" };
    }
    if (!permission.collaborationAllowed) {
      return {
        success: false,
        error: "Editors are only available for workspace surveys",
      };
    }

    const editorIds = await getSurveyEditors(surveyId);
    if (editorIds.length === 0) {
      return { success: true, data: [] };
    }

    const rows = await getDb()
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        grantedAt: surveyEditors.grantedAt,
      })
      .from(users)
      .leftJoin(
        surveyEditors,
        and(
          eq(surveyEditors.userId, users.id),
          eq(surveyEditors.surveyId, surveyId),
        ),
      )
      .where(inArray(users.id, editorIds));

    return { success: true, data: rows };
  } catch (error) {
    console.error("Error fetching survey editors:", error);
    return { success: false, error: "Failed to fetch survey editors" };
  }
}

export const getSurveyCollaboratorsAction = getSurveyEditorsAction;

export async function getRehearsalCommentsAction(
  surveyId: string,
  conversationNumber: number,
): Promise<
  ActionResult<
    Array<{
      id: string;
      body: string;
      createdAt: Date;
      author: { id: string; name: string | null; email: string };
    }>
  >
> {
  try {
    const session = await getVerifiedSession();
    const permission = await getSurveyPermissionForSession(session, surveyId);

    if (!hasSurveyPermission(permission, "canView")) {
      return { success: false, error: "Unauthorized" };
    }
    if (!permission.collaborationAllowed) {
      return {
        success: false,
        error: "Comments are only available for workspace surveys",
      };
    }

    const [conversation] = await getDb()
      .select({ id: sampleConversations.id })
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, surveyId),
          eq(sampleConversations.conversationNumber, conversationNumber),
        ),
      );

    if (!conversation) {
      return { success: true, data: [] };
    }

    const comments = await getDb()
      .select({
        id: surveyCollaborationComments.id,
        body: surveyCollaborationComments.body,
        createdAt: surveyCollaborationComments.createdAt,
        author: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(surveyCollaborationComments)
      .innerJoin(users, eq(users.id, surveyCollaborationComments.authorId))
      .where(
        and(
          eq(surveyCollaborationComments.surveyId, surveyId),
          eq(surveyCollaborationComments.contextType, "rehearsal"),
          eq(surveyCollaborationComments.contextId, conversation.id),
          isNull(surveyCollaborationComments.deletedAt),
        ),
      )
      .orderBy(desc(surveyCollaborationComments.createdAt));

    return { success: true, data: comments };
  } catch (error) {
    console.error("Error fetching rehearsal comments:", error);
    return { success: false, error: "Failed to fetch rehearsal comments" };
  }
}

export async function updatePresenceAction(
  surveyId: string,
): Promise<ActionResult<{ activeUsers: Array<{ id: string; name: string }> }>> {
  try {
    const session = await getVerifiedSession();
    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canView")) {
      return { success: false, error: "Unauthorized" };
    }
    if (!permission.collaborationAllowed) {
      return {
        success: false,
        error: "Presence is only available for workspace surveys",
      };
    }

    const accessors = await getDb()
      .select({
        userId: users.id,
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, session.user.id));

    return {
      success: true,
      data: {
        activeUsers: accessors.map((user) => ({
          id: user.userId,
          name: user.name || "User",
        })),
      },
    };
  } catch (error) {
    console.error("Error updating presence:", error);
    return { success: false, error: "Failed to update presence" };
  }
}
