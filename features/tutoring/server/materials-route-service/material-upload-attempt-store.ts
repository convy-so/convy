import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { lessonMaterialUploadAttempts } from "@/shared/db/schema";
import { publishClassroomRealtimeEvent } from "@/shared/infra/realtime";
import { requireValue } from "@/shared/utils/collections";

import {
  type LearningMaterialUploadAttemptStage,
  type LearningMaterialUploadAttemptStatus,
} from "./material-upload-attempt-state";

async function publishMaterialUploadUpdated(params: {
  classroomId: string;
  lessonId: string;
  batchId: string;
  attemptId: string;
}) {
  await publishClassroomRealtimeEvent(params.classroomId, {
    type: "lesson_material_upload_updated",
    lessonId: params.lessonId,
    batchId: params.batchId,
    attemptIds: [params.attemptId],
  });
}

export async function updateLearningMaterialUploadAttempt(params: {
  attemptId: string;
  classroomId?: string;
  lessonId?: string;
  batchId?: string;
  status?: LearningMaterialUploadAttemptStatus;
  stage?: LearningMaterialUploadAttemptStage;
  fileName?: string;
  title?: string | null;
  description?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  userMessage?: string | null;
  internalError?: string | null;
  errorCode?: string | null;
  retryable?: boolean | null;
  queuedAt?: Date | null;
  processingStartedAt?: Date | null;
  failedAt?: Date | null;
  completedAt?: Date | null;
  failureMessage?: string | null;
  materialId?: string | null;
  previousAttemptId?: string | null;
}) {
  const [attempt] = await getDb()
    .update(lessonMaterialUploadAttempts)
    .set({
      ...(params.previousAttemptId !== undefined
        ? { previousAttemptId: params.previousAttemptId }
        : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.stage ? { stage: params.stage } : {}),
      ...(params.fileName !== undefined ? { fileName: params.fileName } : {}),
      ...(params.title !== undefined ? { title: params.title?.trim() || null } : {}),
      ...(params.description !== undefined
        ? { description: params.description?.trim() || null }
        : {}),
      ...(params.mimeType !== undefined ? { mimeType: params.mimeType } : {}),
      ...(params.sizeBytes !== undefined ? { sizeBytes: params.sizeBytes } : {}),
      ...(params.storageBucket !== undefined
        ? { storageBucket: params.storageBucket }
        : {}),
      ...(params.storagePath !== undefined ? { storagePath: params.storagePath } : {}),
      ...(params.userMessage !== undefined ? { userMessage: params.userMessage } : {}),
      ...(params.internalError !== undefined
        ? { internalError: params.internalError }
        : {}),
      ...(params.errorCode !== undefined ? { errorCode: params.errorCode } : {}),
      ...(params.retryable !== undefined ? { retryable: params.retryable } : {}),
      ...(params.queuedAt !== undefined ? { queuedAt: params.queuedAt } : {}),
      ...(params.processingStartedAt !== undefined
        ? { processingStartedAt: params.processingStartedAt }
        : {}),
      ...(params.failedAt !== undefined ? { failedAt: params.failedAt } : {}),
      ...(params.completedAt !== undefined ? { completedAt: params.completedAt } : {}),
      ...(params.failureMessage !== undefined
        ? { failureMessage: params.failureMessage }
        : {}),
      ...(params.materialId !== undefined ? { materialId: params.materialId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(lessonMaterialUploadAttempts.id, params.attemptId))
    .returning();

  const classroomId = params.classroomId;
  if (attempt && classroomId) {
    await publishMaterialUploadUpdated({
      classroomId,
      lessonId: params.lessonId ?? attempt.lessonId,
      batchId: params.batchId ?? attempt.batchId,
      attemptId: attempt.id,
    });
  }

  return attempt;
}

export async function createLearningMaterialUploadAttempt(params: {
  id: string;
  batchId: string;
  lessonId: string;
  uploadedByUserId: string;
  fileName: string;
  previousAttemptId?: string | null;
  title?: string | null;
  description?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  status: LearningMaterialUploadAttemptStatus;
  stage?: LearningMaterialUploadAttemptStage;
  userMessage?: string | null;
  internalError?: string | null;
  errorCode?: string | null;
  retryable?: boolean | null;
  queuedAt?: Date | null;
  processingStartedAt?: Date | null;
  failedAt?: Date | null;
  completedAt?: Date | null;
  failureMessage?: string | null;
  materialId?: string | null;
}) {
  const now = new Date();
  const [attempt] = await getDb()
    .insert(lessonMaterialUploadAttempts)
    .values({
      id: params.id,
      previousAttemptId: params.previousAttemptId ?? null,
      batchId: params.batchId,
      lessonId: params.lessonId,
      uploadedByUserId: params.uploadedByUserId,
      fileName: params.fileName,
      title: params.title?.trim() || null,
      description: params.description?.trim() || null,
      mimeType: params.mimeType ?? null,
      sizeBytes: params.sizeBytes ?? null,
      storageBucket: params.storageBucket ?? null,
      storagePath: params.storagePath ?? null,
      status: params.status,
      stage: params.stage ?? "upload",
      userMessage: params.userMessage ?? null,
      internalError: params.internalError ?? null,
      errorCode: params.errorCode ?? null,
      retryable: params.retryable ?? null,
      queuedAt: params.queuedAt ?? null,
      processingStartedAt: params.processingStartedAt ?? null,
      failedAt: params.failedAt ?? null,
      completedAt: params.completedAt ?? null,
      failureMessage: params.failureMessage ?? null,
      materialId: params.materialId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return requireValue(
    attempt,
    `Failed to create learning material upload attempt ${params.id}`,
  );
}

