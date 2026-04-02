import { NextResponse } from "next/server";

import { requestEditAccessAction } from "@/app/actions/collaboration";
import { getVerifiedSession } from "@/lib/auth/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { getSurveyPermissionContext } = await import("@/lib/workspace-access");
    const permission = await getSurveyPermissionContext(session.user.id, surveyId, {
      activeWorkspaceId: session.session.activeOrganizationId ?? null,
    });
    if (!permission?.canDiscover || !permission.activeContextMatchesResource) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!permission.collaborationAllowed) {
      return NextResponse.json(
        { error: "Editor requests are only available for workspace surveys" },
        { status: 403 },
      );
    }
    const result = await requestEditAccessAction(surveyId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[Editor Requests] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
