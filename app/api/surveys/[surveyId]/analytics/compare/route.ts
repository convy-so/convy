import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { buildAnalyticsCompareData } from "@/lib/analytics";
import {
  getActiveCoveragePlan,
  getAnalyticsSnapshotByVersion,
} from "@/lib/education/storage";
import {
  getSurveyPermissionContext,
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";

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

    if (!leftVersion || !rightVersion) {
      return NextResponse.json(
        { error: "Both leftVersion and rightVersion are required" },
        { status: 400 },
      );
    }

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

    const [leftRow, rightRow, planRow] = await Promise.all([
      getAnalyticsSnapshotByVersion(surveyId, leftVersion),
      getAnalyticsSnapshotByVersion(surveyId, rightVersion),
      getActiveCoveragePlan(surveyId),
    ]);

    if (!leftRow || !rightRow || !planRow) {
      return NextResponse.json(
        { error: "Unable to load one or both analytics snapshots" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      buildAnalyticsCompareData({
        left: leftRow.snapshot,
        right: rightRow.snapshot,
        plan: planRow.plan,
      }),
    );
  } catch (error) {
    console.error("[Analytics Compare API] Error:", error);
    return NextResponse.json(
      { error: "Failed to compare analytics snapshots" },
      { status: 500 },
    );
  }
}
