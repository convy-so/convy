import { NextResponse } from "next/server";

import {
  publishPendingOutboxEntries,
  recordRealtimeEvent,
  releaseSurveyLease,
} from "@/lib/collaboration-service";
import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import { getSurveyPermissionContext } from "@/lib/workspace-access";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string; stage: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId, stage } = await params;
    if (stage !== "creation" && stage !== "rehearsal") {
      return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }

    const body = await request.json();
    const permission = await getSurveyPermissionContext(session.user.id, surveyId, {
      activeWorkspaceId: session.session.activeOrganizationId ?? null,
    });
    if (!permission?.canEdit || !permission.activeContextMatchesResource) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!permission.collaborationAllowed) {
      return NextResponse.json(
        { error: "Leases are only available for workspace surveys" },
        { status: 403 },
      );
    }
    const result = await releaseSurveyLease({
      surveyId,
      stage,
      userId: session.user.id,
      leaseToken: body.leaseToken,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, lease: "lease" in result ? result.lease : null },
        { status: 409 },
      );
    }

    await getDb().transaction(async (tx) => {
      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId,
        workspaceId: permission?.workspaceId,
        eventType: "survey.lease_released",
        actorId: session.user.id,
        payload: {
          surveyId,
          stage,
          userId: session.user.id,
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
    console.error("[Release Lease] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
