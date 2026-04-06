import { NextResponse } from "next/server";

import { transferSurveyOwnershipAction } from "@/app/actions/survey";
import { getVerifiedSession } from "@/lib/auth/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const result = await transferSurveyOwnershipAction({
      surveyId,
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

