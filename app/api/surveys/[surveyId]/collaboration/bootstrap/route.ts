import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import {
  sampleConversations,
  surveyCollaborationComments,
  surveyEditorRequests,
  surveyEditors,
  surveyCreationConversations,
  surveys,
  users,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getActiveSurveyLease,
  getCurrentSurveyRevision,
} from "@/lib/collaboration-service";
import {
  getSurveyPermissionContext,
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const permission = await getSurveyPermissionForSession(session, surveyId);

    if (!hasSurveyPermission(permission, "canView")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!permission.collaborationAllowed) {
      return NextResponse.json(
        { error: "Collaboration is only available for workspace surveys" },
        { status: 403 },
      );
    }

    const db = getDb();
    const [
      survey,
      revision,
      creationConversation,
      editors,
      pendingRequests,
      sampleRows,
      activeCreationLease,
      activeRehearsalLease,
    ] = await Promise.all([
      db.select().from(surveys).where(eq(surveys.id, surveyId)).then((rows) => rows[0]),
      getCurrentSurveyRevision(surveyId),
      db
        .select()
        .from(surveyCreationConversations)
        .where(eq(surveyCreationConversations.surveyId, surveyId))
        .then((rows) => rows[0]),
      db
        .select({
          userId: surveyEditors.userId,
          grantedBy: surveyEditors.grantedBy,
          grantedAt: surveyEditors.grantedAt,
          name: users.name,
          email: users.email,
        })
        .from(surveyEditors)
        .innerJoin(users, eq(users.id, surveyEditors.userId))
        .where(eq(surveyEditors.surveyId, surveyId)),
      db
        .select({
          id: surveyEditorRequests.id,
          requesterId: surveyEditorRequests.requesterId,
          status: surveyEditorRequests.status,
          requestedAt: surveyEditorRequests.requestedAt,
          resolvedAt: surveyEditorRequests.resolvedAt,
          resolvedBy: surveyEditorRequests.resolvedBy,
          requesterName: users.name,
          requesterEmail: users.email,
        })
        .from(surveyEditorRequests)
        .innerJoin(users, eq(users.id, surveyEditorRequests.requesterId))
        .where(eq(surveyEditorRequests.surveyId, surveyId)),
      db
        .select({
          id: sampleConversations.id,
          conversationNumber: sampleConversations.conversationNumber,
          confirmed: sampleConversations.confirmed,
          updatedAt: sampleConversations.updatedAt,
          commentsCount: sampleConversations.comments,
        })
        .from(sampleConversations)
        .where(eq(sampleConversations.surveyId, surveyId))
        .orderBy(asc(sampleConversations.conversationNumber)),
      getActiveSurveyLease(surveyId, "creation"),
      getActiveSurveyLease(surveyId, "rehearsal"),
    ]);

    const creationComments = await db
      .select({
        id: surveyCollaborationComments.id,
        body: surveyCollaborationComments.body,
        authorId: surveyCollaborationComments.authorId,
        createdAt: surveyCollaborationComments.createdAt,
        authorName: users.name,
      })
      .from(surveyCollaborationComments)
      .innerJoin(users, eq(users.id, surveyCollaborationComments.authorId))
      .where(
        and(
          eq(surveyCollaborationComments.surveyId, surveyId),
          eq(surveyCollaborationComments.contextType, "creation"),
          eq(surveyCollaborationComments.contextId, surveyId),
          isNull(surveyCollaborationComments.deletedAt),
        ),
      )
      .orderBy(asc(surveyCollaborationComments.createdAt));

    return NextResponse.json({
      survey,
      revision,
      permission,
      creationConversation,
      comments: {
        creation: creationComments,
      },
      editors,
      editorRequests: pendingRequests,
      leases: {
        creation: activeCreationLease,
        rehearsal: activeRehearsalLease,
      },
      rehearsals: sampleRows.map((row) => ({
        id: row.id,
        conversationNumber: row.conversationNumber,
        confirmed: row.confirmed,
        updatedAt: row.updatedAt,
        commentsCount: Array.isArray(row.commentsCount)
          ? row.commentsCount.length
          : 0,
      })),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[Survey Collaboration Bootstrap] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
