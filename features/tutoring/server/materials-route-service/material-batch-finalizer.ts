import { eq } from "drizzle-orm";

import { rebuildLessonGroundingPack } from "@/features/tutoring/server/lesson-grounding-pack-service";
import { TUTORING_STATUS } from "@/shared/tutoring/constants";
import { getDb } from "@/shared/db";
import { lessonMaterialUploadAttempts } from "@/shared/db/schema";
import { type LessonMaterialBatchFinalizeJobData } from "@/shared/infra/queue";

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
    attempt.status === TUTORING_STATUS.uploadFailed ||
    attempt.status === TUTORING_STATUS.uploadSucceeded
  ) {
    return true;
  }

  return (
    attempt.status === TUTORING_STATUS.uploadProcessing &&
    Boolean(attempt.materialId)
  );
}

function buildLatestBatchLeafState(
  attempts: Array<typeof lessonMaterialUploadAttempts.$inferSelect>,
) {
  const activeAttempts = getActiveBatchAttempts(attempts);
  const failedAttempts = activeAttempts.filter(
    (attempt) => attempt.status === TUTORING_STATUS.uploadFailed,
  );
  const incompleteAttempts = activeAttempts.filter((attempt) => !isFileTerminalAttempt(attempt));
  const successfulAttempts = activeAttempts.filter(
    (attempt) => attempt.status !== TUTORING_STATUS.uploadFailed && Boolean(attempt.materialId),
  );

  return {
    activeAttempts,
    failedAttempts,
    incompleteAttempts,
    successfulAttempts,
  };
}

export async function processLearningMaterialBatchFinalizer(
  data: LessonMaterialBatchFinalizeJobData,
) {
  const startedAt = Date.now();
  console.info("[lesson-material-batch-worker] finalize start", {
    batchId: data.batchId,
    lessonId: data.lessonId,
    classroomId: data.classroomId,
  });

  const attempts = await getDb().query.lessonMaterialUploadAttempts.findMany({
    where: eq(lessonMaterialUploadAttempts.batchId, data.batchId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const { activeAttempts, failedAttempts, incompleteAttempts, successfulAttempts } =
    buildLatestBatchLeafState(attempts);

  if (activeAttempts.length === 0) {
    console.info("[lesson-material-batch-worker] finalize empty", {
      batchId: data.batchId,
      lessonId: data.lessonId,
      durationMs: Date.now() - startedAt,
    });
    return { success: true, status: "empty" as const };
  }

  if (incompleteAttempts.length > 0) {
    console.info("[lesson-material-batch-worker] finalize waiting for incomplete attempts", {
      batchId: data.batchId,
      lessonId: data.lessonId,
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
          lessonId: attempt.lessonId,
          batchId: attempt.batchId,
          status: TUTORING_STATUS.uploadSucceeded,
          stage: TUTORING_STATUS.uploadStagePackBuild,
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

    console.info("[lesson-material-batch-worker] finalize completed with failed attempts", {
      batchId: data.batchId,
      lessonId: data.lessonId,
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

  await rebuildLessonGroundingPack(data.lessonId);

  await Promise.all(
    successfulAttempts.map((attempt) =>
      updateLearningMaterialUploadAttempt({
        attemptId: attempt.id,
        classroomId: data.classroomId,
        lessonId: attempt.lessonId,
        batchId: attempt.batchId,
        status: TUTORING_STATUS.uploadSucceeded,
        stage: TUTORING_STATUS.uploadStagePackBuild,
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

  console.info("[lesson-material-batch-worker] finalize succeeded", {
    batchId: data.batchId,
    lessonId: data.lessonId,
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
  data: LessonMaterialBatchFinalizeJobData,
  error: unknown,
) {
  const attempts = await getDb().query.lessonMaterialUploadAttempts.findMany({
    where: eq(lessonMaterialUploadAttempts.batchId, data.batchId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
  const { successfulAttempts } = buildLatestBatchLeafState(attempts);
  const failure = buildUploadAttemptFailure(TUTORING_STATUS.uploadStagePackBuild, error);

  await Promise.all(
    successfulAttempts.map((attempt) =>
      updateLearningMaterialUploadAttempt({
        attemptId: attempt.id,
        classroomId: data.classroomId,
        lessonId: attempt.lessonId,
        batchId: attempt.batchId,
        status: TUTORING_STATUS.uploadFailed,
        stage: TUTORING_STATUS.uploadStagePackBuild,
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


