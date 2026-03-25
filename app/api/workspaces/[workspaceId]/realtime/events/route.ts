import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/auth/session";
import { getWorkspaceRealtimeEvents } from "@/lib/collaboration-service";
import { isWorkspaceMember } from "@/lib/workspace-access";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { workspaceId } = await params;
    const afterRevision = Number(
      new URL(request.url).searchParams.get("afterRevision") || "0",
    );

    if (!(await isWorkspaceMember(session.user.id, workspaceId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const events = await getWorkspaceRealtimeEvents(workspaceId, afterRevision);
    return NextResponse.json({ events });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[Workspace Realtime Events] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
