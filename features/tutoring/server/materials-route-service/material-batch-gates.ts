import { topicSourceBoundarySchema } from "@/features/tutoring/public-server";
import {
  LEARNING_STATUS,
  MATERIAL_BATCH_GATE_STATUS,
} from "@/shared/learning/constants";
import { requireValue } from "@/shared/utils/collections";

import { isMaterialAnalysisFailed } from "./material-upload-attempt-state";

export type MaterialBatchGateState =
  | {
      batchId: null;
      status: typeof MATERIAL_BATCH_GATE_STATUS.IDLE;
      attemptCount: number;
      succeededCount: number;
      failedCount: number;
      processingCount: number;
      materialIds: string[];
    }
  | {
      batchId: string;
      status:
        | typeof MATERIAL_BATCH_GATE_STATUS.PROCESSING
        | typeof MATERIAL_BATCH_GATE_STATUS.FAILED
        | typeof MATERIAL_BATCH_GATE_STATUS.SUCCEEDED;
      attemptCount: number;
      succeededCount: number;
      failedCount: number;
      processingCount: number;
      materialIds: string[];
    };

export function getActiveBatchAttempts<
  T extends {
    id?: string;
    previousAttemptId?: string | null;
    batchId: string;
    createdAt?: Date | string | null;
  },
>(attempts: T[]) {
  if (attempts.length === 0) return [];

  const latestBatchId = [...attempts]
    .sort(
      (left, right) =>
        new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime(),
    )[0]?.batchId;
  const batchAttempts = attempts.filter((attempt) => attempt.batchId === latestBatchId);
  const supersededIds = new Set(
    batchAttempts
      .map((attempt) => attempt.previousAttemptId ?? null)
      .filter((attemptId): attemptId is string => Boolean(attemptId)),
  );

  return batchAttempts.filter((attempt) => !supersededIds.has(attempt.id ?? ""));
}

export function getLatestMaterialBatchGateState(
  attempts: Array<{
    id?: string;
    previousAttemptId?: string | null;
    batchId: string;
    status: string;
    materialId?: string | null;
    createdAt?: Date | string | null;
  }>,
): MaterialBatchGateState {
  if (attempts.length === 0) {
    return {
      batchId: null,
      status: MATERIAL_BATCH_GATE_STATUS.IDLE,
      attemptCount: 0,
      succeededCount: 0,
      failedCount: 0,
      processingCount: 0,
      materialIds: [],
    };
  }

  const sorted = [...attempts].sort((left, right) => {
    const leftTime = new Date(left.createdAt ?? 0).getTime();
    const rightTime = new Date(right.createdAt ?? 0).getTime();
    return rightTime - leftTime;
  });
  const latestAttempt = requireValue(
    sorted[0],
    "Expected a latest upload attempt when attempts are present",
  );
  const latestBatchId = latestAttempt.batchId;
  const latestBatchAttempts = getActiveBatchAttempts(
    sorted.filter((attempt) => attempt.batchId === latestBatchId),
  );
  const succeededCount = latestBatchAttempts.filter(
    (attempt) => attempt.status === LEARNING_STATUS.uploadSucceeded,
  ).length;
  const failedCount = latestBatchAttempts.filter(
    (attempt) => attempt.status === LEARNING_STATUS.uploadFailed,
  ).length;
  const processingCount = latestBatchAttempts.filter(
    (attempt) =>
      attempt.status === LEARNING_STATUS.uploadQueued ||
      attempt.status === LEARNING_STATUS.uploadProcessing,
  ).length;

  return {
    batchId: latestBatchId,
    status:
      processingCount > 0
        ? MATERIAL_BATCH_GATE_STATUS.PROCESSING
        : failedCount > 0
          ? MATERIAL_BATCH_GATE_STATUS.FAILED
          : MATERIAL_BATCH_GATE_STATUS.SUCCEEDED,
    attemptCount: latestBatchAttempts.length,
    succeededCount,
    failedCount,
    processingCount,
    materialIds: latestBatchAttempts
      .map((attempt) => attempt.materialId ?? null)
      .filter((materialId): materialId is string => Boolean(materialId)),
  };
}

function sameIdSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

export function getTopicActivationMaterialGate(params: {
  topic: {
    sourceBoundary?: unknown;
    topicGroundingPack?: { materialIds?: string[] | null } | null;
  };
  materials: Array<{
    id: string;
    extractionStatus: string;
    indexingStatus: string;
    analysis?: Record<string, unknown> | null;
  }>;
  attempts: Array<{
    id?: string;
    previousAttemptId?: string | null;
    batchId: string;
    status: string;
    stage?: string | null;
    materialId?: string | null;
    createdAt?: Date | string | null;
  }>;
}) {
  const batch = getLatestMaterialBatchGateState(params.attempts);
  const activeBatchAttempts = getActiveBatchAttempts(params.attempts);
  const boundary = topicSourceBoundarySchema.parse(params.topic.sourceBoundary ?? {});
  const completedMaterialIds = params.materials
    .filter(
      (material) =>
        material.extractionStatus === LEARNING_STATUS.materialCompleted &&
        material.indexingStatus === LEARNING_STATUS.materialCompleted &&
        !isMaterialAnalysisFailed(material.analysis),
    )
    .map((material) => material.id);
  const expectedPackMaterialIds =
    boundary.allowedMaterialIds.length > 0
      ? completedMaterialIds.filter((id) => boundary.allowedMaterialIds.includes(id))
      : completedMaterialIds;
  const packMaterialIds = (params.topic.topicGroundingPack?.materialIds ?? []).filter(Boolean);
  const packMatchesCurrentMaterials = sameIdSet(packMaterialIds, expectedPackMaterialIds);
  const onlyPackBuildFailures =
    activeBatchAttempts.length > 0 &&
    activeBatchAttempts
      .filter((attempt) => attempt.status === LEARNING_STATUS.uploadFailed)
      .every((attempt) => attempt.stage === LEARNING_STATUS.uploadStagePackBuild);

  if (batch.status === MATERIAL_BATCH_GATE_STATUS.PROCESSING) {
    return {
      ready: false,
      reason:
        batch.attemptCount === 1
          ? "Activation is locked until the uploaded material finishes processing."
          : `Activation is locked until all ${batch.attemptCount} files in the current upload batch finish processing.`,
    };
  }

  if (batch.status === MATERIAL_BATCH_GATE_STATUS.FAILED) {
    if (
      onlyPackBuildFailures &&
      expectedPackMaterialIds.length > 0 &&
      params.topic.topicGroundingPack &&
      packMatchesCurrentMaterials
    ) {
      return {
        ready: true,
        reason: "",
      };
    }

    return {
      ready: false,
      reason:
        batch.attemptCount === 1
          ? "Activation is locked because the latest uploaded file failed. Retry or remove it first."
          : `Activation is locked because ${batch.failedCount} of ${batch.attemptCount} files in the latest upload batch failed. Retry or remove the failed files first.`,
    };
  }

  if (expectedPackMaterialIds.length === 0) {
    return {
      ready: false,
      reason:
        "Upload and finish processing at least one supporting material before activating this session.",
    };
  }

  if (!params.topic.topicGroundingPack || !packMatchesCurrentMaterials) {
    return {
      ready: false,
      reason:
        "Activation is locked until the tutoring pack is rebuilt from the full successful material set.",
    };
  }

  return {
    ready: true,
    reason: "",
  };
}
