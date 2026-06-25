import { and, eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { surveySessions, surveys } from "@/shared/db/schema";
import {
  buildDashboardAnalyticsData,
  buildTimelineEntry,
  translateSurveyAnalyticsData,
} from "@/features/surveys/server/analytics/dashboard-analytics";
import { getEducationProgram } from "@/features/surveys/server/education/catalog";
import {
  getActiveCoveragePlan,
  getAnalyticsState,
  getLatestAnalyticsSnapshot,
  getResearchBrief,
  listAnalyticsSnapshots,
  listEvidenceForSurveyByType,
} from "@/features/surveys/server/education/storage";
import { normalizeAppLocale } from "@/shared/i18n/config";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import { getUserPreferredLanguage } from "@/features/surveys/public-server";
import { apiError } from "@/shared/http/api-error";
import type { AuthSessionWithUser } from "@/features/auth/public-server";

type GetSurveyAnalyticsInput = {
  surveyId: string;
  session: AuthSessionWithUser;
  language: string | null;
};

export async function getSurveyAnalyticsViewModel(input: GetSurveyAnalyticsInput): Promise<Response> {
  const permission = await getSurveyPermissionForSession(input.session, input.surveyId);
  if (!hasSurveyPermission(permission, "canView")) {
    return apiError("UNAUTHORIZED", "Unauthorized");
  }

  const [survey, briefRow, planRow, snapshotRow, stateRow, snapshotRows, sessionRows, evidenceRows] = await Promise.all([
    getDb().select({ title: surveys.title }).from(surveys).where(eq(surveys.id, input.surveyId)).then((rows) => rows[0]),
    getResearchBrief(input.surveyId),
    getActiveCoveragePlan(input.surveyId),
    getLatestAnalyticsSnapshot(input.surveyId),
    getAnalyticsState(input.surveyId),
    listAnalyticsSnapshots(input.surveyId),
    getDb().select({ id: surveySessions.id, status: surveySessions.sessionStatus }).from(surveySessions).where(and(eq(surveySessions.surveyId, input.surveyId), eq(surveySessions.sessionType, "live"))),
    listEvidenceForSurveyByType(input.surveyId, "live"),
  ]);

  if (!survey) return apiError("NOT_FOUND", "Survey not found");

  const analyticsState = stateRow?.state ?? {
    surveyId: input.surveyId,
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
    const status = analyticsState.status === "failed"
      ? "failed"
      : analyticsState.status === "running"
        ? "running"
        : analyticsState.status === "queued"
          ? "queued"
          : "not_generated";

    const message = analyticsState.status === "failed"
      ? analyticsState.lastError || "Analytics generation failed. Retry to regenerate the snapshot."
      : analyticsState.status === "running"
        ? "Analytics are currently being rebuilt in the background."
        : analyticsState.status === "queued"
          ? "A new analytics snapshot has been queued and will appear once the background job completes."
          : "We are waiting for enough grounded session evidence to build the analytics snapshot.";

    return Response.json({ status, message, analyticsState, conversationStats: { total: sessionRows.length, completed } });
  }

  const brief = briefRow.brief;
  const program = getEducationProgram(brief.programId);
  const viewerLanguage = normalizeAppLocale(
    input.language ?? (await getUserPreferredLanguage(input.session.user.id).catch(() => "en")),
  );

  const analyticsData = buildDashboardAnalyticsData({
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
  });

  return Response.json(
    await translateSurveyAnalyticsData(analyticsData, viewerLanguage, {
      userId: input.session.user.id,
      surveyId: input.surveyId,
    }),
  );
}
