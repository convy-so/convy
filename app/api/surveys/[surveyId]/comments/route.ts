import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { sampleConversations, surveyCollaborationComments } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  recordRealtimeEvent,
} from "@/lib/collaboration-service";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const permission = await getSurveyPermissionForSession(session, surveyId);

    if (!hasSurveyPermission(permission, "canComment")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!permission.collaborationAllowed) {
      return NextResponse.json(
        { error: "Comments are only available for workspace surveys" },
        { status: 403 },
      );
    }

    const text = typeof body.body === "string" ? body.body.trim() : "";
    const contextType =
      body.contextType === "rehearsal" ? "rehearsal" : "creation";
    let contextId =
      typeof body.contextId === "string" && body.contextId.trim()
        ? body.contextId
        : surveyId;

    if (!text) {
      return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
    }

    if (
      contextType === "rehearsal" &&
      typeof body.conversationNumber === "number" &&
      (!body.contextId || body.contextId === surveyId)
    ) {
      const [conversation] = await getDb()
        .select({ id: sampleConversations.id })
        .from(sampleConversations)
        .where(
          and(
            eq(sampleConversations.surveyId, surveyId),
            eq(sampleConversations.conversationNumber, body.conversationNumber),
          ),
        );
      if (!conversation) {
        return NextResponse.json(
          { error: "Sample conversation not found" },
          { status: 404 },
        );
      }
      contextId = conversation.id;
    }

    const commentId = nanoid();
    await getDb().transaction(async (tx) => {
      await tx.insert(surveyCollaborationComments).values({
        id: commentId,
        surveyId,
        contextType,
        contextId,
        authorId: session.user.id,
        body: text,
      });

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
            contextType,
            contextId,
            body: text,
            authorId: session.user.id,
          },
        },
      });
    });

    return NextResponse.json({ id: commentId });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[Comments] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
