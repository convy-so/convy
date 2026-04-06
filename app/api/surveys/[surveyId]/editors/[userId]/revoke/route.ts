import { NextResponse } from "next/server";

import { revokeEditAccessAction } from "@/app/actions/collaboration";
import { getVerifiedSession } from "@/lib/auth/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string; userId: string }> },
) {
  try {
    await getVerifiedSession();
    const { surveyId, userId } = await params;
    const result = await revokeEditAccessAction({
      surveyId,
      userIdToGrant: userId,
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

