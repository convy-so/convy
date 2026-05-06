import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { buildAnalyticsCompareData } from "@/lib/analytics";
import {
  getActiveCoveragePlan,
  getAnalyticsSnapshotByVersion,
} from "@/lib/education/storage";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { searchParams } = new URL(request.url);
    const leftVersion = Number(searchParams.get("leftVersion"));
    const rightVersion = Number(searchParams.get("rightVersion"));

    if (!leftVersion || !rightVersion) { return apiError("VALIDATION_ERROR", "Both leftVersion and rightVersion are required"); }

    const [survey] = await getDb()
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

    const [leftRow, rightRow, planRow] = await Promise.all([
      getAnalyticsSnapshotByVersion(surveyId, leftVersion),
      getAnalyticsSnapshotByVersion(surveyId, rightVersion),
      getActiveCoveragePlan(surveyId),
    ]);

    if (!leftRow || !rightRow || !planRow) { return apiError("NOT_FOUND", "Unable to load one or both analytics snapshots"); }

    return NextResponse.json(
      buildAnalyticsCompareData({
        left: leftRow.snapshot,
        right: rightRow.snapshot,
        plan: planRow.plan,
      }),
    );
  } catch (error) { return apiUnhandledError(error, "Failed to compare analytics snapshots", "/api/surveys/[surveyId]/analytics/compare:get"); }
}

