import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getAnalyticsState } from "@/lib/education/storage";
import { getSurveyPermissionContext } from "@/lib/workspace-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const [survey] = await getDb()
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const permission = await getSurveyPermissionContext(session.user.id, survey.id, {
      activeWorkspaceId: session.session.activeOrganizationId ?? null,
    });
    if (!permission?.canView || !permission.activeContextMatchesResource) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({
      state: (await getAnalyticsState(surveyId))?.state ?? null,
    });
  } catch (error) {
    console.error("[Analytics Status API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics status" },
      { status: 500 },
    );
  }
}
