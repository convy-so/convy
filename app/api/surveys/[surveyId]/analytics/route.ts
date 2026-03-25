import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveySessions, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { buildDashboardAnalyticsData, buildTimelineEntry } from "@/lib/analytics";
import { scheduleAnalyticsRefresh } from "@/lib/analytics-scheduler";
import { getEducationProgram } from "@/lib/education/catalog";
import { getSurveyPermissionContext } from "@/lib/workspace-access";
import {
  getActiveCoveragePlan,
  getAnalyticsState,
  getLatestAnalyticsSnapshot,
  getResearchBrief,
  listAnalyticsSnapshots,
  listEvidenceForSurveyByType,
} from "@/lib/education/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const permission = await getSurveyPermissionContext(session.user.id, surveyId, {
      activeWorkspaceId: session.session.activeOrganizationId ?? null,
    });
    if (!permission?.canView || !permission.activeContextMatchesResource) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [survey, briefRow, planRow, snapshotRow, stateRow, snapshotRows, sessionRows, evidenceRows] = await Promise.all([
      getDb()
        .select({ title: surveys.title })
        .from(surveys)
        .where(eq(surveys.id, surveyId))
        .then((rows) => rows[0]),
      getResearchBrief(surveyId),
      getActiveCoveragePlan(surveyId),
      getLatestAnalyticsSnapshot(surveyId),
      getAnalyticsState(surveyId),
      listAnalyticsSnapshots(surveyId),
      getDb()
        .select({
          id: surveySessions.id,
          status: surveySessions.sessionStatus,
        })
        .from(surveySessions)
        .where(
          and(
            eq(surveySessions.surveyId, surveyId),
            eq(surveySessions.sessionType, "live"),
          ),
        ),
      listEvidenceForSurveyByType(surveyId, "live"),
    ]);

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const analyticsState = stateRow?.state ?? {
      surveyId,
      status: "idle",
      latestSnapshotVersion: snapshotRow?.version ?? 0,
      pendingJobId: null,
      lastRequestedAt: null,
      lastCompletedAt: null,
      lastMaterialityReason: null,
      lastMaterialityScore: 0,
      lastError: null,
    };

    if (!snapshotRow || !briefRow || !planRow) {
      const completed = sessionRows.filter((row) => row.status === "completed").length;
      return NextResponse.json({
        status: analyticsState.status === "failed"
          ? "failed"
          : analyticsState.status === "running"
            ? "running"
            : analyticsState.status === "queued"
              ? "queued"
              : "not_generated",
        message:
          analyticsState.status === "failed"
            ? analyticsState.lastError || "Analytics generation failed. Retry to regenerate the snapshot."
            : analyticsState.status === "running"
              ? "Analytics are currently being rebuilt in the background."
              : analyticsState.status === "queued"
                ? "A new analytics snapshot has been queued and will appear once the background job completes."
                : "We are waiting for enough grounded session evidence to build the analytics snapshot.",
        analyticsState,
        conversationStats: {
          total: sessionRows.length,
          completed,
        },
      });
    }

    const brief = briefRow.brief;
    const program = getEducationProgram(brief.programId);

    return NextResponse.json(
      buildDashboardAnalyticsData({
        surveyTitle: survey.title,
        brief,
        briefVersion: briefRow.version,
        plan: planRow.plan,
        snapshot: snapshotRow.snapshot,
        analyticsState,
        timeline: snapshotRows.map((row) => buildTimelineEntry(row.snapshot)),
        programDisplayName: program.manifest.displayName,
        programDescription: program.manifest.description,
        evidence: evidenceRows.map((row) => row.metadata),
      }),
    );
  } catch (error) {
    console.error("[Analytics API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const permission = await getSurveyPermissionContext(session.user.id, surveyId, {
      activeWorkspaceId: session.session.activeOrganizationId ?? null,
    });
    if (!permission?.canEdit || !permission.activeContextMatchesResource) {
      return NextResponse.json(
        { error: "Unauthorized. Only owners and editors can trigger analytics." },
        { status: 403 },
      );
    }

    await scheduleAnalyticsRefresh({
      surveyId,
      userId: session.user.id,
      force: true,
    });

    return NextResponse.json({
      status: "queued",
    });
  } catch (error) {
    console.error("[Analytics API POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to trigger analytics generation" },
      { status: 500 },
    );
  }
}
