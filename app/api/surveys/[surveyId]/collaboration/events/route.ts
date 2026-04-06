import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/session";
import { getSurveyRealtimeEvents } from "@/lib/collaboration-service";
import {
  getSurveyPermissionContext,
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const afterRevision = Number(
      new URL(request.url).searchParams.get("afterRevision") || "0",
    );

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canView")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!permission.collaborationAllowed) {
      return NextResponse.json(
        { error: "Realtime collaboration is only available for workspace surveys" },
        { status: 403 },
      );
    }

    const events = await getSurveyRealtimeEvents(surveyId, afterRevision);
    return NextResponse.json({ events });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[Survey Collaboration Events] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
