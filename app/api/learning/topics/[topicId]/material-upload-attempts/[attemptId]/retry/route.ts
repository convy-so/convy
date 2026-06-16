import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { topicMaterialUploadAttempts } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import {
  buildUploadAttemptFailure,
  createLearningMaterialUploadAttempt,
  getTeacherTopicOrNull,
  normalizeLearningMaterialUploadAttemptStage,
  updateLearningMaterialUploadAttempt,
} from "@/lib/learning/materials-route-service";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import { enqueueLearningMaterialProcessing } from "@/lib/queue";

type RetryFailurePoint = "queue_enqueue" | "attempt_queue_update";

function annotateRetryError(failurePoint: RetryFailurePoint, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(`${failurePoint}: ${message}`);
  (wrapped as Error & { cause?: unknown }).cause = error;
  return wrapped;
}

function serializeUploadAttempt(attempt: {
  id: string;
  previousAttemptId?: string | null;
  batchId: string;
  topicId: string;
  uploadedByUserId: string;
  fileName: string;
  title?: string | null;
  description?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  status: string;
  stage: string;
  userMessage?: string | null;
  retryable?: boolean | null;
  queuedAt?: Date | null;
  processingStartedAt?: Date | null;
  failedAt?: Date | null;
  completedAt?: Date | null;
  failureMessage?: string | null;
  internalError?: string | null;
  materialId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: attempt.id,
    previousAttemptId: attempt.previousAttemptId ?? null,
    batchId: attempt.batchId,
    topicId: attempt.topicId,
    uploadedByUserId: attempt.uploadedByUserId,
    fileName: attempt.fileName,
    title: attempt.title ?? null,
    description: attempt.description ?? null,
    mimeType: attempt.mimeType ?? null,
    sizeBytes: attempt.sizeBytes ?? null,
    storageBucket: attempt.storageBucket ?? null,
    storagePath: attempt.storagePath ?? null,
    status: attempt.status,
    stage: normalizeLearningMaterialUploadAttemptStage(attempt.stage),
    userMessage: attempt.userMessage ?? null,
    retryable: attempt.retryable ?? null,
    queuedAt: attempt.queuedAt ?? null,
    processingStartedAt: attempt.processingStartedAt ?? null,
    failedAt: attempt.failedAt ?? null,
    completedAt: attempt.completedAt ?? null,
    failureMessage: attempt.failureMessage ?? null,
    internalError:
      process.env.NODE_ENV === "production" ? null : (attempt.internalError ?? null),
    materialId: attempt.materialId ?? null,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  };
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

    if (sourceAttempt.status !== "failed") {
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
      status: "processing",
      stage: "extraction",
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
          status: "queued",
          stage: "extraction",
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
      const failure = buildUploadAttemptFailure("extraction", annotatedError);
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
          status: "failed",
          stage: "extraction",
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
      "/api/learning/topics/[topicId]/material-upload-attempts/[attemptId]/retry",
    );
  }
}
