import { normalizeLearningMaterialUploadAttemptStage } from "@/features/tutoring/server/materials-route-service";

export function serializeUploadAttempt(attempt: {
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
