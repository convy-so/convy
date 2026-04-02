import {
  getSurveyAnalyticsQueue,
  type SurveyAnalyticsJobData,
} from "@/lib/queue";
import {
  getAnalyticsState,
  getLatestAnalyticsSnapshot,
  listSurveySessionInsightsByType,
  upsertAnalyticsState,
} from "@/lib/education/storage";
import type {
  AnalyticsGenerationState,
} from "@/lib/education/types";
import {
  recordRealtimeEvent,
} from "@/lib/collaboration-service";
import { getDb } from "@/db";

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

function getDebouncedJobId(surveyId: string) {
  return `analytics-refresh-${surveyId}`;
}

async function cancelPendingAnalyticsJob(surveyId: string) {
  const queue = getSurveyAnalyticsQueue();
  const jobId = getDebouncedJobId(surveyId);
  const existing = await queue.getJob(jobId);
  if (existing) {
    await existing.remove();
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

export async function markAnalyticsRunning(surveyId: string) {
  const current = (await getAnalyticsState(surveyId))?.state ?? createDefaultState(surveyId);
  return await upsertAnalyticsState(surveyId, {
    ...current,
    status: "running",
    pendingJobId: current.pendingJobId,
    lastRequestedAt: current.lastRequestedAt ?? new Date().toISOString(),
    lastError: null,
  });
}

export async function markAnalyticsCompleted(params: {
  surveyId: string;
  version: number;
  reason: string;
  score: number;
}) {
  const current = (await getAnalyticsState(params.surveyId))?.state ?? createDefaultState(params.surveyId);
  const state = await upsertAnalyticsState(params.surveyId, {
    ...current,
    status: "idle",
    latestSnapshotVersion: params.version,
    pendingJobId: null,
    lastCompletedAt: new Date().toISOString(),
    lastMaterialityReason: params.reason,
    lastMaterialityScore: params.score,
    lastError: null,
  });

  await getDb().transaction(async (tx) => {
    await recordRealtimeEvent(tx, {
      scope: "survey",
      surveyId: params.surveyId,
      actorId: "system",
      eventType: "survey.analytics_ready",
      payload: {
        surveyId: params.surveyId,
        version: params.version,
        reason: params.reason,
        score: params.score,
      },
    });
  });

  return state;
}

export async function markAnalyticsFailed(surveyId: string, error: unknown) {
  const current = (await getAnalyticsState(surveyId))?.state ?? createDefaultState(surveyId);
  return await upsertAnalyticsState(surveyId, {
    ...current,
    status: "failed",
    pendingJobId: null,
    lastError: error instanceof Error ? error.message : "Unknown analytics worker error",
  });
}

export async function scheduleAnalyticsRefresh(params: {
  surveyId: string;
  userId: string;
  force?: boolean;
}) {
  const [stateRow, snapshotRow, insightRows] = await Promise.all([
    getAnalyticsState(params.surveyId),
    getLatestAnalyticsSnapshot(params.surveyId),
    listSurveySessionInsightsByType(params.surveyId, "live"),
  ]);

  const state = stateRow?.state ?? createDefaultState(params.surveyId);
  const latestSnapshot = snapshotRow?.snapshot ?? null;
  const completedSessions = insightRows.filter(
    (row) => row.insight.quality?.completeness >= 0.8,
  ).length;
  const coverageOverall =
    insightRows.length > 0
      ? insightRows.reduce(
          (sum, row) => sum + (row.insight.quality?.completeness ?? 0),
          0,
        ) / insightRows.length
      : 0;
  const averageReliability =
    insightRows.length > 0
      ? insightRows.reduce(
          (sum, row) => sum + (row.insight.quality?.reliability ?? 0),
          0,
        ) / insightRows.length
      : 0;

  const previousCoverageByNode = latestSnapshot?.coverage.byNode ?? {};
  const latestCoverageByNode: Record<string, number> = {};
  for (const row of insightRows) {
    const nodeCoverage = getNodeCoverage(row.insight);
    for (const [nodeId, value] of Object.entries(nodeCoverage)) {
      latestCoverageByNode[nodeId] = (latestCoverageByNode[nodeId] ?? 0) + Number(value ?? 0);
    }
  }
  const divisor = Math.max(1, insightRows.length);
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

  await cancelPendingAnalyticsJob(params.surveyId);
  const queue = getSurveyAnalyticsQueue();
  const jobId = getDebouncedJobId(params.surveyId);
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
