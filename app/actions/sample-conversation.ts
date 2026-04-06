"use server";

import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  sampleConversations,
  surveyCollaborationComments,
  surveys,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";
import {
  recordRealtimeEvent,
} from "@/lib/collaboration-service";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function addSampleConversationCommentAction(
  surveyId: string,
  conversationNumber: number,
  text: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canComment")) {
      return { success: false, error: "Unauthorized" };
    }

    if (!survey.organizationId) {
      return {
        success: false,
        error: "Team comments are only available in workspace surveys.",
      };
    }

    const [conversation] = await getDb()
      .select()
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, surveyId),
          eq(sampleConversations.conversationNumber, conversationNumber),
        ),
      );

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    const commentId = nanoid();

    await getDb().transaction(async (tx) => {
      await tx.insert(surveyCollaborationComments).values({
        id: commentId,
        surveyId,
        contextType: "rehearsal",
        contextId: conversation.id,
        authorId: session.user.id,
        body: text,
      });

      await tx
        .update(sampleConversations)
        .set({
          comments: [
            ...(conversation.comments || []),
            {
              id: commentId,
              userId: session.user.id,
              userName: session.user.name,
              text,
              createdAt: new Date().toISOString(),
            },
          ],
        })
        .where(eq(sampleConversations.id, conversation.id));

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.comment_added",
        actorId: session.user.id,
        payload: {
          surveyId,
          comment: {
            id: commentId,
            contextType: "rehearsal",
            contextId: conversation.id,
            body: text,
            authorId: session.user.id,
            conversationNumber,
          },
        },
      });
    });

    return { success: true, data: { id: commentId } };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to add comment" };
  }
}
