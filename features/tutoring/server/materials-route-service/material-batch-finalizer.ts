import { eq } from "drizzle-orm";

import { rebuildTopicGroundingPack } from "@/features/tutoring/server/lesson-grounding-pack-service";
import { LEARNING_STATUS } from "@/shared/learning/constants";
import { getDb } from "@/shared/db";
import { topicMaterialUploadAttempts } from "@/shared/db/schema";
import { type LearningMaterialBatchFinalizeJobData } from "@/shared/infra/queue";

import {
  getActiveBatchAttempts,
} from "./material-batch-gates";
import { buildUploadAttemptFailure } from "./material-upload-attempt-state";
import { updateLearningMaterialUploadAttempt } from "./material-upload-attempt-store";

function isFileTerminalAttempt(attempt: {
  status: string;
  materialId?: string | null;
}) {
  if (
    attempt.status === LEARNING_STATUS.uploadFailed ||
    attempt.status === LEARNING_STATUS.uploadSucceeded
  ) {
    return true;
  }

  return (
    attempt.status === LEARNING_STATUS.uploadProcessing &&
    Boolean(attempt.materialId)
  );
}

function buildLatestBatchLeafState(
  attempts: Array<typeof topicMaterialUploadAttempts.$inferSelect>,
) {
  const activeAttempts = getActiveBatchAttempts(attempts);
  const failedAttempts = activeAttempts.filter(
    (attempt) => attempt.status === LEARNING_STATUS.uploadFailed,
  );
  const incompleteAttempts = activeAttempts.filter((attempt) => !isFileTerminalAttempt(attempt));
  const successfulAttempts = activeAttempts.filter(
    (attempt) => attempt.status !== LEARNING_STATUS.uploadFailed && Boolean(attempt.materialId),
  );

  return {
    activeAttempts,
    failedAttempts,
    incompleteAttempts,
    successfulAttempts,
  };
}

export async function processLearningMaterialBatchFinalizer(
  data: LearningMaterialBatchFinalizeJobData,
) {
  const startedAt = Date.now();
  console.info("[learning-material-batch-worker] finalize start", {
    batchId: data.batchId,
    topicId: data.topicId,
    classroomId: data.classroomId,
  });

  const attempts = await getDb().query.topicMaterialUploadAttempts.findMany({
    where: eq(topicMaterialUploadAttempts.batchId, data.batchId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const { activeAttempts, failedAttempts, incompleteAttempts, successfulAttempts } =
    buildLatestBatchLeafState(attempts);

  if (activeAttempts.length === 0) {
    console.info("[learning-material-batch-worker] finalize empty", {
      batchId: data.batchId,
      topicId: data.topicId,
      durationMs: Date.now() - startedAt,
    });
    return { success: true, status: "empty" as const };
  }

  if (incompleteAttempts.length > 0) {
    console.info("[learning-material-batch-worker] finalize waiting for incomplete attempts", {
      batchId: data.batchId,
      topicId: data.topicId,
      pendingCount: incompleteAttempts.length,
      activeCount: activeAttempts.length,
      durationMs: Date.now() - startedAt,
    });
    return {
      success: true,
      status: "batch_incomplete" as const,
      pendingCount: incompleteAttempts.length,
    };
  }

  if (failedAttempts.length > 0) {
    await Promise.all(
      successfulAttempts.map((attempt) =>
        updateLearningMaterialUploadAttempt({
          attemptId: attempt.id,
          classroomId: data.classroomId,
          topicId: attempt.topicId,
          batchId: attempt.batchId,
          status: LEARNING_STATUS.uploadSucceeded,
          stage: LEARNING_STATUS.uploadStagePackBuild,
          userMessage: null,
          internalError: null,
          errorCode: null,
          retryable: null,
          failedAt: null,
          completedAt: attempt.completedAt ?? new Date(),
          failureMessage: null,
          materialId: attempt.materialId ?? null,
        }),
      ),
    );

    console.info("[learning-material-batch-worker] finalize completed with failed attempts", {
      batchId: data.batchId,
      topicId: data.topicId,
      failedCount: failedAttempts.length,
      successfulCount: successfulAttempts.length,
      durationMs: Date.now() - startedAt,
    });

    return {
      success: true,
      status: "batch_failed" as const,
      failedCount: failedAttempts.length,
    };
  }

  await rebuildTopicGroundingPack(data.topicId);

  await Promise.all(
    successfulAttempts.map((attempt) =>
      updateLearningMaterialUploadAttempt({
        attemptId: attempt.id,
        classroomId: data.classroomId,
        topicId: attempt.topicId,
        batchId: attempt.batchId,
        status: LEARNING_STATUS.uploadSucceeded,
        stage: LEARNING_STATUS.uploadStagePackBuild,
        userMessage: null,
        internalError: null,
        errorCode: null,
        retryable: null,
        failedAt: null,
        completedAt: new Date(),
        failureMessage: null,
        materialId: attempt.materialId ?? null,
      }),
    ),
  );

  console.info("[learning-material-batch-worker] finalize succeeded", {
    batchId: data.batchId,
    topicId: data.topicId,
    materialCount: successfulAttempts.length,
    durationMs: Date.now() - startedAt,
  });

  return {
    success: true,
    status: "batch_succeeded" as const,
    materialCount: successfulAttempts.length,
  };
}

export async function markLearningMaterialBatchFinalizerFailed(
  data: LearningMaterialBatchFinalizeJobData,
  error: unknown,
) {
  const attempts = await getDb().query.topicMaterialUploadAttempts.findMany({
    where: eq(topicMaterialUploadAttempts.batchId, data.batchId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
  const { successfulAttempts } = buildLatestBatchLeafState(attempts);
  const failure = buildUploadAttemptFailure(LEARNING_STATUS.uploadStagePackBuild, error);

  await Promise.all(
    successfulAttempts.map((attempt) =>
      updateLearningMaterialUploadAttempt({
        attemptId: attempt.id,
        classroomId: data.classroomId,
        topicId: attempt.topicId,
        batchId: attempt.batchId,
        status: LEARNING_STATUS.uploadFailed,
        stage: LEARNING_STATUS.uploadStagePackBuild,
        userMessage: failure.userMessage,
        internalError: failure.internalError,
        errorCode: failure.errorCode,
        retryable: failure.retryable,
        failedAt: failure.failedAt,
        completedAt: null,
        failureMessage: failure.failureMessage,
        materialId: attempt.materialId ?? null,
      }),
    ),
  );
}
