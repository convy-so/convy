import { NextResponse } from "next/server";

import { inviteToWorkspace } from "@/app/actions/workspace";
import { getVerifiedSession } from "@/lib/auth/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    await getVerifiedSession();
    const { workspaceId } = await params;
    const body = await request.json();
    const result = await inviteToWorkspace({
      email: body.email,
      organizationId: workspaceId,
      role: "member",
    });

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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

