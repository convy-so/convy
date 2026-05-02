import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { buildTimelineEntry } from "@/lib/analytics";
import { listAnalyticsSnapshots } from "@/lib/education/storage";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";

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

    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

    const rows = await listAnalyticsSnapshots(surveyId);
    return NextResponse.json({
      history: rows.map((row) => buildTimelineEntry(row.snapshot)).reverse(),
    });
  } catch (error) { return apiUnhandledError(error, "Failed to fetch analytics history", "/api/surveys/[surveyId]/analytics/history:get"); }
}

