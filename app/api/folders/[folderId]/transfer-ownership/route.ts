import { NextResponse } from "next/server";

import { transferFolderOwnershipAction } from "@/app/actions/folder";
import { getVerifiedSession } from "@/lib/auth/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> },
) {
  try {
    await getVerifiedSession();
    const { folderId } = await params;
    const body = await request.json();
    const result = await transferFolderOwnershipAction({
      folderId,
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}



