import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";

import { getDb } from "@/shared/db";
import { topicMaterialUploadAttempts } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { LEARNING_STATUS } from "@/shared/learning/constants";
import {
  buildUploadAttemptFailure,
  createLearningMaterialUploadAttempt,
  getTeacherTopicOrNull,
  updateLearningMaterialUploadAttempt,
} from "@/features/tutoring/server/materials-route-service";
import { handleLearningRouteError } from "@/features/tutoring/server/route-errors";
import { enqueueLearningMaterialProcessing } from "@/shared/infra/queue";
import { serializeUploadAttempt } from "@/features/tutoring/server/api/lesson-material-upload-response";

type RetryFailurePoint = "queue_enqueue" | "attempt_queue_update";

function annotateRetryError(failurePoint: RetryFailurePoint, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(`${failurePoint}: ${message}`);
  (wrapped as Error & { cause?: unknown }).cause = error;
  return wrapped;
}


export async function POST(
  _request: Request,
  { params }: { params: Promise<{ topicId: string; attemptId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId, attemptId } = await params;
    const topic = await getTeacherTopicOrNull(session.user.id, topicId);
    if (!topic) return apiError("UNAUTHORIZED", "Unauthorized");

    const sourceAttempt = await getDb().query.topicMaterialUploadAttempts.findFirst({
      where: and(
        eq(topicMaterialUploadAttempts.id, attemptId),
        eq(topicMaterialUploadAttempts.topicId, topicId),
      ),
    });

    if (!sourceAttempt) {
      return apiError("NOT_FOUND", "Upload attempt not found");
    }

    if (sourceAttempt.status !== LEARNING_STATUS.uploadFailed) {
      return apiError(
        "VALIDATION_ERROR",
        "Only failed upload attempts can be retried",
      );
    }

    if (!sourceAttempt.storagePath || !sourceAttempt.mimeType) {
      return apiError(
        "VALIDATION_ERROR",
        "This failed upload cannot be retried because the source file is no longer available",
      );
    }

    const retryAttemptId = nanoid();
    let retryAttempt = await createLearningMaterialUploadAttempt({
      id: retryAttemptId,
      previousAttemptId: sourceAttempt.id,
      batchId: sourceAttempt.batchId,
      topicId,
      uploadedByUserId: session.user.id,
      fileName: sourceAttempt.fileName,
      title: sourceAttempt.title ?? null,
      description: sourceAttempt.description ?? null,
      mimeType: sourceAttempt.mimeType,
      sizeBytes: sourceAttempt.sizeBytes ?? null,
      storageBucket: sourceAttempt.storageBucket ?? null,
      storagePath: sourceAttempt.storagePath,
      status: LEARNING_STATUS.uploadProcessing,
      stage: LEARNING_STATUS.uploadStageExtraction,
      processingStartedAt: new Date(),
    });

    let failurePoint: RetryFailurePoint = "queue_enqueue";
    try {
      console.info("[learning-material-upload-retry] enqueue start", {
        topicId,
        sourceAttemptId: sourceAttempt.id,
        retryAttemptId,
        batchId: sourceAttempt.batchId,
        storagePath: sourceAttempt.storagePath,
      });
      const processingJob = await enqueueLearningMaterialProcessing({
        attemptId: retryAttemptId,
        topicId,
        classroomId: topic.classroomId,
        userId: session.user.id,
        storagePath: sourceAttempt.storagePath,
        fileName: sourceAttempt.fileName,
        mimeType: sourceAttempt.mimeType,
        sizeBytes: sourceAttempt.sizeBytes ?? 0,
        title: sourceAttempt.title ?? null,
        description: sourceAttempt.description ?? null,
      });
      console.info("[learning-material-upload-retry] enqueue complete", {
        topicId,
        sourceAttemptId: sourceAttempt.id,
        retryAttemptId,
        batchId: sourceAttempt.batchId,
        jobId: processingJob?.id ?? null,
      });

      failurePoint = "attempt_queue_update";
      retryAttempt =
        (await updateLearningMaterialUploadAttempt({
            attemptId: retryAttemptId,
            classroomId: topic.classroomId,
            topicId,
            batchId: sourceAttempt.batchId,
            status: LEARNING_STATUS.uploadQueued,
            stage: LEARNING_STATUS.uploadStageExtraction,
            queuedAt: new Date(),
          userMessage: null,
          internalError: null,
          errorCode: null,
          retryable: null,
          failedAt: null,
          completedAt: null,
          failureMessage: null,
        })) ?? retryAttempt;
    } catch (error) {
      const annotatedError = annotateRetryError(failurePoint, error);
      const failure = buildUploadAttemptFailure(
        LEARNING_STATUS.uploadStageExtraction,
        annotatedError,
      );
      console.error("[learning-material-upload-retry] failed", {
        topicId,
        sourceAttemptId: sourceAttempt.id,
        retryAttemptId,
        batchId: sourceAttempt.batchId,
        failurePoint,
        error: annotatedError,
      });
      retryAttempt =
        (await updateLearningMaterialUploadAttempt({
          attemptId: retryAttemptId,
          classroomId: topic.classroomId,
          topicId,
          batchId: sourceAttempt.batchId,
          status: LEARNING_STATUS.uploadFailed,
          stage: LEARNING_STATUS.uploadStageExtraction,
          userMessage: failure.userMessage,
          internalError: failure.internalError,
          errorCode: failure.errorCode,
          retryable: failure.retryable,
          failedAt: failure.failedAt,
          completedAt: null,
          failureMessage: failure.failureMessage,
        })) ?? retryAttempt;
    }

    return NextResponse.json({
      success: true,
      data: {
        attempt: serializeUploadAttempt(retryAttempt),
      },
    });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to retry material upload",
      "/api/learning/lessons/[lessonId]/material-upload-attempts/[attemptId]/retry",
    );
  }
}
