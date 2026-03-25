import { NextResponse } from "next/server";

import { transferProjectOwnershipAction } from "@/app/actions/project";
import { getVerifiedSession } from "@/lib/auth/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    await getVerifiedSession();
    const { projectId } = await params;
    const body = await request.json();
    const result = await transferProjectOwnershipAction({
      projectId,
      newOwnerUserId: body.newOwnerUserId,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[Transfer Project Ownership] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
