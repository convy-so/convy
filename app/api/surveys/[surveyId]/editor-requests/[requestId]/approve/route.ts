import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { grantEditAccessAction } from "@/app/actions/collaboration";
import { getDb } from "@/db";
import { surveyEditorRequests } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string; requestId: string }> },
) {
  try {
    await getVerifiedSession();
    const { surveyId, requestId } = await params;
    const [requestRow] = await getDb()
      .select({ requesterId: surveyEditorRequests.requesterId })
      .from(surveyEditorRequests)
      .where(
        and(
          eq(surveyEditorRequests.id, requestId),
          eq(surveyEditorRequests.surveyId, surveyId),
        ),
      );

    if (!requestRow) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const result = await grantEditAccessAction({
      surveyId,
      userIdToGrant: requestRow.requesterId,
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

