import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { buildTimelineEntry } from "@/lib/analytics";
import { listAnalyticsSnapshots } from "@/lib/education/storage";
import {
  getSurveyPermissionContext,
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";

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

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const rows = await listAnalyticsSnapshots(surveyId);
    return NextResponse.json({
      history: rows.map((row) => buildTimelineEntry(row.snapshot)).reverse(),
    });
  } catch (error) {
    console.error("[Analytics History API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics history" },
      { status: 500 },
    );
  }
}
