import { nanoid } from "nanoid";
import {
  getSurveyAnalyticsQueue,
  type SurveyAnalyticsJobData,
} from "@/shared/infra/queue";
import {
  getAnalyticsState,
  getLatestAnalyticsSnapshot,
  listSurveySessionsByType,
  upsertAnalyticsState,
} from "@/features/surveys/server/education/storage";
import type {
  AnalyticsGenerationState,
} from "@/features/surveys/server/education/types";

const ACTIVE_DEBOUNCE_MS = 90 * 1000;
const BOOTSTRAP_DEBOUNCE_MS = 60 * 1000;
const STALE_SNAPSHOT_MS = 6 * 60 * 60 * 1000;

function createDefaultState(surveyId: string): AnalyticsGenerationState {
  return {
    surveyId,
    status: "idle",
    latestSnapshotVersion: 0,
    pendingJobId: null,
    lastRequestedAt: null,
    lastCompletedAt: null,
    lastMaterialityReason: null,
    lastMaterialityScore: 0,
    lastError: null,
  };
}

function clamp(min: number, value: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNodeCoverage(value: unknown): Record<string, number> {
  if (!isRecord(value) || !isRecord(value.nodeCoverage)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value.nodeCoverage).flatMap(([nodeId, score]) =>
      typeof score === "number" ? [[nodeId, score]] : [],
    ),
  );
}

function createAnalyticsJobId(surveyId: string) {
  return `analytics-refresh-${surveyId}-${nanoid(8)}`;
}

async function cancelPendingAnalyticsJob(jobId: string | null) {
  if (!jobId) {
    return;
  }

  const queue = getSurveyAnalyticsQueue();
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState().catch(() => null);
    if (state && state !== "active") {
      await existing.remove();
    }
  }
}

type MaterialityDecision = {
  shouldQueue: boolean;
  debounceMs: number;
  score: number;
  reason: string;
};

function decideMateriality(input: {
  completedSessions: number;
  lastCompletedSessions: number;
  coverageOverall: number;
  lastCoverageOverall: number;
  averageReliability: number;
  lastAverageReliability: number;
  nodeMilestonesCrossed: string[];
  thresholdCrossedCount: number;
  snapshotAgeMs: number | null;
  force?: boolean;
}) : MaterialityDecision {
  if (input.force) {
    return {
      shouldQueue: true,
      debounceMs: 0,
      score: 1.5,
      reason: "manual_refresh",
    };
  }

  if (input.completedSessions <= 0) {
    return { shouldQueue: false, debounceMs: ACTIVE_DEBOUNCE_MS, score: 0, reason: "waiting_for_completed_sessions" };
  }

  if (input.lastCompletedSessions === 0) {
    return {
      shouldQueue: true,
      debounceMs: BOOTSTRAP_DEBOUNCE_MS,
      score: 1,
      reason: "first_completed_session",
    };
  }

  if (input.completedSessions <= 5 && input.completedSessions > input.lastCompletedSessions) {
    return {
      shouldQueue: true,
      debounceMs: BOOTSTRAP_DEBOUNCE_MS,
      score: 1,
      reason: "bootstrap_snapshot",
    };
  }

  const completedDelta = Math.max(0, input.completedSessions - input.lastCompletedSessions);
  const adaptiveSessionDelta = clamp(2, Math.ceil(Math.sqrt(input.lastCompletedSessions)), 10);
  const coverageDelta = Math.abs(input.coverageOverall - input.lastCoverageOverall);
  const reliabilityDelta = Math.abs(input.averageReliability - input.lastAverageReliability);

  let score = 0;
  let reason = "no_material_change";

  if (completedDelta >= adaptiveSessionDelta) {
    score += 0.7;
    reason = "new_respondent_wave";
  }

  if (coverageDelta >= 0.05) {
    score += 0.35;
    reason = reason === "no_material_change" ? "coverage_shift" : reason;
  }

  if (input.nodeMilestonesCrossed.length > 0) {
    score += 0.35;
    reason = reason === "no_material_change" ? "coverage_milestone" : reason;
  }

  if (input.thresholdCrossedCount > 0) {
    score += 0.25;
    reason = reason === "no_material_change" ? "node_threshold_reached" : reason;
  }

  if (reliabilityDelta >= 0.05) {
    score += 0.25;
    reason = reason === "no_material_change" ? "quality_shift" : reason;
  }

  if (
    input.snapshotAgeMs !== null &&
    input.snapshotAgeMs >= STALE_SNAPSHOT_MS &&
    completedDelta > 0
  ) {
    score += 0.2;
    reason = reason === "no_material_change" ? "stale_snapshot" : reason;
  }

  return {
    shouldQueue: score >= 1,
    debounceMs: ACTIVE_DEBOUNCE_MS,
    score,
    reason,
  };
}

export async function markAnalyticsRunning(params: {
  surveyId: string;
  jobId?: string | null;
}) {
  const current = (await getAnalyticsState(params.surveyId))?.state ??
    createDefaultState(params.surveyId);
  return await upsertAnalyticsState(params.surveyId, {
    ...current,
    status: "running",
    pendingJobId:
      params.jobId && current.pendingJobId === params.jobId
        ? null
        : current.pendingJobId,
    lastRequestedAt: current.lastRequestedAt ?? new Date().toISOString(),
    lastError: null,
  });
}

export async function markAnalyticsCompleted(params: {
  surveyId: string;
  version: number;
  reason: string;
  score: number;
  jobId?: string | null;
}) {
  const current = (await getAnalyticsState(params.surveyId))?.state ?? createDefaultState(params.surveyId);
  const state = await upsertAnalyticsState(params.surveyId, {
    ...current,
    status: current.pendingJobId ? "queued" : "idle",
    latestSnapshotVersion: params.version ?? current.latestSnapshotVersion,
    pendingJobId:
      params.jobId && current.pendingJobId === params.jobId
        ? null
        : current.pendingJobId,
    lastCompletedAt: new Date().toISOString(),
    lastMaterialityReason: params.reason,
    lastMaterialityScore: params.score,
    lastError: null,
  });

  return state;
}

export async function markAnalyticsDeferred(params: {
  surveyId: string;
  reason: string;
  score: number;
  jobId?: string | null;
}) {
  const current = (await getAnalyticsState(params.surveyId))?.state ??
    createDefaultState(params.surveyId);
  return await upsertAnalyticsState(params.surveyId, {
    ...current,
    status: current.pendingJobId ? "queued" : "idle",
    pendingJobId:
      params.jobId && current.pendingJobId === params.jobId
        ? null
        : current.pendingJobId,
    lastCompletedAt: new Date().toISOString(),
    lastMaterialityReason: params.reason,
    lastMaterialityScore: params.score,
    lastError: null,
  });
}

export async function markAnalyticsFailed(params: {
  surveyId: string;
  error: unknown;
  jobId?: string | null;
}) {
  const current = (await getAnalyticsState(params.surveyId))?.state ??
    createDefaultState(params.surveyId);
  const nextPendingJobId =
    params.jobId && current.pendingJobId === params.jobId
      ? null
      : current.pendingJobId;
  return await upsertAnalyticsState(params.surveyId, {
    ...current,
    status: nextPendingJobId ? "queued" : "failed",
    pendingJobId: nextPendingJobId,
    lastError:
      params.error instanceof Error
        ? params.error.message
        : "Unknown analytics worker error",
  });
}

export async function scheduleAnalyticsRefresh(params: {
  surveyId: string;
  userId: string;
  force?: boolean;
}) {
  const [stateRow, snapshotRow, sessionRows] = await Promise.all([
    getAnalyticsState(params.surveyId),
    getLatestAnalyticsSnapshot(params.surveyId),
    listSurveySessionsByType(params.surveyId, "live"),
  ]);

  const state = stateRow?.state ?? createDefaultState(params.surveyId);
  const latestSnapshot = snapshotRow?.snapshot ?? null;
  const completedSessions = sessionRows.filter(
    (row) =>
      row.sessionStatus === "completed" ||
      row.sessionState.status === "completed" ||
      row.sessionState.overallCoverage >= 0.8,
  ).length;
  const coverageOverall =
    sessionRows.length > 0
      ? sessionRows.reduce(
          (sum, row) => sum + (row.sessionState.overallCoverage ?? 0),
          0,
        ) / sessionRows.length
      : 0;
  const averageReliability =
    sessionRows.length > 0
      ? sessionRows.reduce(
          (sum, row) => sum + (row.sessionState.reliabilityScore ?? 0),
          0,
        ) / sessionRows.length
      : 0;

  const previousCoverageByNode = latestSnapshot?.coverage.byNode ?? {};
  const latestCoverageByNode: Record<string, number> = {};
  for (const row of sessionRows) {
    const nodeCoverage = getNodeCoverage({
      nodeCoverage: row.sessionState.coverageByNode,
    });
    for (const [nodeId, value] of Object.entries(nodeCoverage)) {
      latestCoverageByNode[nodeId] = (latestCoverageByNode[nodeId] ?? 0) + Number(value ?? 0);
    }
  }
  const divisor = Math.max(1, sessionRows.length);
  const nodeMilestonesCrossed = Object.entries(latestCoverageByNode)
    .filter(([nodeId, total]) => {
      const previous = previousCoverageByNode[nodeId] ?? 0;
      const current = total / divisor;
      const milestones = [0.25, 0.5, 0.75, 0.9, 1];
      return milestones.some((milestone) => previous < milestone && current >= milestone);
    })
    .map(([nodeId]) => nodeId);

  const decision = decideMateriality({
    completedSessions,
    lastCompletedSessions: latestSnapshot?.participation.completedSessions ?? 0,
    coverageOverall,
    lastCoverageOverall: latestSnapshot?.coverage.overall ?? 0,
    averageReliability,
    lastAverageReliability: latestSnapshot?.quality.averageReliability ?? 0,
    nodeMilestonesCrossed,
    thresholdCrossedCount: nodeMilestonesCrossed.length,
    snapshotAgeMs: latestSnapshot
      ? Date.now() - new Date(latestSnapshot.generatedAt).getTime()
      : null,
    force: params.force,
  });

  if (!decision.shouldQueue) {
    if (!stateRow) {
      await upsertAnalyticsState(params.surveyId, state);
    }
    return { queued: false, reason: decision.reason, score: decision.score };
  }

  await cancelPendingAnalyticsJob(state.pendingJobId);
  const queue = getSurveyAnalyticsQueue();
  const jobId = createAnalyticsJobId(params.surveyId);
  await queue.add(
    "generate-analytics",
    {
      surveyId: params.surveyId,
      userId: params.userId,
      reason: decision.reason,
      score: decision.score,
    } satisfies SurveyAnalyticsJobData,
    {
      jobId,
      delay: decision.debounceMs,
      priority: params.force ? 1 : 3,
    },
  );

  await upsertAnalyticsState(params.surveyId, {
    ...state,
    status: "queued",
    pendingJobId: jobId,
    lastRequestedAt: new Date().toISOString(),
    lastMaterialityReason: decision.reason,
    lastMaterialityScore: decision.score,
    lastError: null,
  });

  return { queued: true, reason: decision.reason, score: decision.score };
}
