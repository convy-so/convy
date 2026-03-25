import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveyEditorRequests } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  publishPendingOutboxEntries,
  recordRealtimeEvent,
} from "@/lib/collaboration-service";
import { getSurveyPermissionContext } from "@/lib/workspace-access";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string; requestId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId, requestId } = await params;
    const permission = await getSurveyPermissionContext(session.user.id, surveyId);

    if (!permission?.isSurveyCreator) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await getDb().transaction(async (tx) => {
      await tx
        .update(surveyEditorRequests)
        .set({
          status: "rejected",
          resolvedAt: new Date(),
          resolvedBy: session.user.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(surveyEditorRequests.id, requestId),
            eq(surveyEditorRequests.surveyId, surveyId),
          ),
        );

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.editor_request_resolved",
        actorId: session.user.id,
        payload: {
          surveyId,
          requestId,
          status: "rejected",
        },
      });
    });
    await publishPendingOutboxEntries();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[Reject Editor Request] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
