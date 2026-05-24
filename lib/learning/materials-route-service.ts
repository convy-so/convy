import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  learningEvidenceEmbeddings,
  learningTopics,
  topicMaterialUploadAttempts,
  topicMaterials,
} from "@/db/schema";
import { getTeacherTopicAccess } from "@/lib/learning/access";
import {
  analyzeLearningMaterial,
  extractLearningMaterialText,
} from "@/lib/learning/materials";
import { buildLearningMaterialAccessPath } from "@/lib/media-access";
import {
  deleteLearningMaterial,
  downloadLearningMaterial,
} from "@/lib/storage";
import { rebuildTopicGroundingPack } from "@/lib/learning/topic-grounding-pack-service";
import { topicSourceBoundarySchema } from "@/lib/learning/types";
import { publishClassroomRealtimeEvent } from "@/lib/realtime";
import type { LearningMaterialProcessingJobData } from "@/lib/queue";

export type LearningMaterialUploadAttemptStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed";
export type LearningMaterialUploadAttemptStage =
  | "upload"
  | "extraction"
  | "analysis"
  | "indexing"
  | "pack_build";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getErrorCause(error: unknown) {
  if (!error || typeof error !== "object" || !("cause" in error)) {
    return null;
  }

  return (error as { cause?: unknown }).cause ?? null;
}

function getErrorCode(error: unknown) {
  const candidate = [error, getErrorCause(error)].find(
    (item) =>
      item &&
      typeof item === "object" &&
      "code" in item &&
      typeof (item as { code?: unknown }).code === "string",
  ) as { code?: string } | undefined;

  return candidate?.code ?? null;
}

function buildInternalErrorMessage(error: unknown) {
  const message = getErrorMessage(error, "Unknown learning material pipeline error");
  const cause = getErrorCause(error);
  const details =
    cause && typeof cause === "object"
      ? [
          typeof (cause as { message?: unknown }).message === "string"
            ? `cause=${(cause as { message: string }).message}`
            : null,
          typeof (cause as { code?: unknown }).code === "string"
            ? `code=${(cause as { code: string }).code}`
            : null,
          typeof (cause as { detail?: unknown }).detail === "string"
            ? `detail=${(cause as { detail: string }).detail}`
            : null,
          typeof (cause as { hint?: unknown }).hint === "string"
            ? `hint=${(cause as { hint: string }).hint}`
            : null,
          typeof (cause as { constraint?: unknown }).constraint === "string"
            ? `constraint=${(cause as { constraint: string }).constraint}`
            : null,
        ].filter(Boolean)
      : [];

  return [message, ...details].join(" | ").slice(0, 4_000);
}

function isRetryableAttemptError(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();
  const code = getErrorCode(error)?.toLowerCase() ?? "";

  if (
    message.includes("unsupported learning material format") ||
    message.includes("file is required") ||
    message.includes("user is no longer authorized") ||
    message.includes("topic not found") ||
    message.includes("could not be found for processing")
  ) {
    return false;
  }

  if (["23503", "23505", "22p02"].includes(code)) {
    return false;
  }

  if (
    code.startsWith("5") ||
    code === "40001" ||
    code === "40p01" ||
    ["etimedout", "econnreset", "enotfound", "sockethangup"].includes(code)
  ) {
    return true;
  }

  return true;
}

function getUserMessageForStageFailure(
  stage: LearningMaterialUploadAttemptStage,
  error: unknown,
) {
  const message = getErrorMessage(error, "");

  if (message.toLowerCase().includes("unsupported learning material format")) {
    return "This file format is not supported. Upload a PDF, DOCX, or TXT file.";
  }

  switch (stage) {
    case "upload":
      return "This file could not be uploaded. Try again.";
    case "extraction":
      return "This file was uploaded, but its text could not be extracted. Try again or use a different file.";
    case "analysis":
      return "This file was uploaded, but the teaching-material review step failed. Try again.";
    case "indexing":
      return "This file was uploaded, but saving the processed material failed. Try again.";
    case "pack_build":
      return "This file was processed, but the topic grounding pack could not be rebuilt. Try again.";
    default:
      return "This file could not be processed. Try again.";
  }
}

export function buildUploadAttemptFailure(
  stage: LearningMaterialUploadAttemptStage,
  error: unknown,
) {
  const userMessage = getUserMessageForStageFailure(stage, error);

  return {
    userMessage,
    internalError: buildInternalErrorMessage(error),
    errorCode: getErrorCode(error),
    retryable: isRetryableAttemptError(error),
    failedAt: new Date(),
    failureMessage: userMessage,
  };
}

export function inferMaterialKind(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  return "document";
}

export function normalizeDetectedLearningMaterialMime(params: {
  filename: string;
  fileType?: string | null;
  detectedMime?: string | null;
}) {
  const extension = params.filename.split(".").pop()?.trim().toLowerCase();
  const mime = params.detectedMime || params.fileType || "application/octet-stream";

  if (
    extension === "docx" &&
    (mime === "application/zip" ||
      mime === "application/x-zip-compressed" ||
      mime === "application/octet-stream")
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return mime;
}

export function isMaterialAnalysisFailed(
  analysis: Record<string, unknown> | null | undefined,
) {
  return (
    analysis?.analysisStatus === "failed" ||
    analysis?.status === "failed" ||
    typeof analysis?.analysisError === "string"
  );
}

export async function getTeacherTopicOrNull(userId: string, topicId: string) {
  return getTeacherTopicAccess(userId, topicId);
}

async function publishMaterialUploadUpdated(params: {
  classroomId: string;
  topicId: string;
  batchId: string;
  attemptId: string;
}) {
  await publishClassroomRealtimeEvent(params.classroomId, {
    type: "learning_material_upload_updated",
    topicId: params.topicId,
    batchId: params.batchId,
    attemptIds: [params.attemptId],
  });
}

export async function updateLearningMaterialUploadAttempt(params: {
  attemptId: string;
  classroomId?: string;
  topicId?: string;
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
    .update(topicMaterialUploadAttempts)
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
    .where(eq(topicMaterialUploadAttempts.id, params.attemptId))
    .returning();

  const classroomId = params.classroomId;
  if (attempt && classroomId) {
    await publishMaterialUploadUpdated({
      classroomId,
      topicId: params.topicId ?? attempt.topicId,
      batchId: params.batchId ?? attempt.batchId,
      attemptId: attempt.id,
    });
  }

  return attempt;
}

export async function createLearningMaterialUploadAttempt(params: {
  id: string;
  batchId: string;
  topicId: string;
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
    .insert(topicMaterialUploadAttempts)
    .values({
      id: params.id,
      previousAttemptId: params.previousAttemptId ?? null,
      batchId: params.batchId,
      topicId: params.topicId,
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

  return attempt;
}

export async function indexMaterialAndSyncBoundary(params: {
  topicId: string;
  materialId: string;
  material: typeof topicMaterials.$inferSelect;
  mimeType: string;
  extractedText: string;
  analysis: Record<string, unknown>;
  topic: NonNullable<Awaited<ReturnType<typeof getTeacherTopicAccess>>>;
}) {
  const currentTopic = await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, params.topicId),
    columns: { sourceBoundary: true },
  });
  const existingBoundary = topicSourceBoundarySchema.parse(currentTopic?.sourceBoundary ?? {});
  const updatedBoundary = topicSourceBoundarySchema.parse({
    ...existingBoundary,
    rigorNotes: Array.from(new Set([...(existingBoundary.rigorNotes || []), ...((params.analysis.rigorNotes as string[]) || [])])),
    notationNotes: Array.from(new Set([...(existingBoundary.notationNotes || []), ...((params.analysis.notationNotes as string[]) || [])])),
    scopeNotes: Array.from(new Set([...(existingBoundary.scopeNotes || []), ...((params.analysis.scopeNotes as string[]) || [])])),
  });

  await Promise.all([
    getDb().update(topicMaterials).set({ indexingStatus: "completed", indexingError: null, updatedAt: new Date() }).where(eq(topicMaterials.id, params.materialId)),
    getDb().update(learningTopics).set({ sourceBoundary: updatedBoundary, lastMaterialSyncAt: new Date(), updatedAt: new Date() }).where(eq(learningTopics.id, params.topicId)),
  ]);
  await rebuildTopicGroundingPack(params.topicId);
}

async function deleteMaterialProcessingArtifacts(params: {
  materialId?: string | null;
  storagePath?: string | null;
  deleteSourceFile?: boolean;
}) {
  if (params.materialId) {
    await getDb()
      .delete(learningEvidenceEmbeddings)
      .where(
        and(
          eq(learningEvidenceEmbeddings.sourceType, "material"),
          eq(learningEvidenceEmbeddings.sourceId, params.materialId),
        ),
      );
    await getDb()
      .delete(topicMaterials)
      .where(eq(topicMaterials.id, params.materialId));
  }

  if (params.deleteSourceFile && params.storagePath) {
    try {
      await deleteLearningMaterial(params.storagePath);
    } catch (error) {
      console.warn("[learning-material-worker] failed to cleanup storage object", {
        storagePath: params.storagePath,
        error: getErrorMessage(error, "Storage cleanup failed"),
      });
    }
  }
}

export async function processLearningMaterialUploadAttempt(
  data: LearningMaterialProcessingJobData,
) {
  const attempt = await getDb().query.topicMaterialUploadAttempts.findFirst({
    where: eq(topicMaterialUploadAttempts.id, data.attemptId),
  });

  if (!attempt || attempt.status === "succeeded") {
    return { success: true, skipped: "missing_or_completed" as const };
  }

  let materialId: string | null = null;
  let currentStage: LearningMaterialUploadAttemptStage = "extraction";

  try {
    const topic = await getTeacherTopicAccess(data.userId, data.topicId);
    if (!topic) {
      throw new Error("Topic not found or user is no longer authorized.");
    }

    if (!attempt.storagePath) {
      throw new Error("Uploaded file could not be found for processing.");
    }

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "processing",
      stage: "extraction",
      userMessage: null,
      internalError: null,
      errorCode: null,
      retryable: null,
      failedAt: null,
      completedAt: null,
      processingStartedAt: attempt.processingStartedAt ?? new Date(),
      failureMessage: null,
      materialId: null,
    });

    const buffer = await downloadLearningMaterial(attempt.storagePath);
    const extractedText = await extractLearningMaterialText({
      buffer,
      filename: data.fileName,
      mimeType: data.mimeType,
    });

    currentStage = "analysis";
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "processing",
      stage: "analysis",
    });

    const analysis = await analyzeLearningMaterial({
      topicTitle: topic.title,
      topicDescription: topic.description,
      learningOutcomes: topic.learningOutcomes,
      materialText: extractedText,
    });

    if (isMaterialAnalysisFailed(analysis)) {
      throw new Error("AI material review failed for this file.");
    }

    currentStage = "indexing";
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "processing",
      stage: "indexing",
    });

    materialId = nanoid();
    const [material] = await getDb()
      .insert(topicMaterials)
      .values({
        id: materialId,
        topicId: data.topicId,
        uploadedByUserId: data.userId,
        title: data.title?.trim() || data.fileName,
        description: data.description?.trim() || null,
        materialKind: inferMaterialKind(data.mimeType),
        storageBucket: attempt.storageBucket,
        storagePath: data.storagePath,
        publicUrl: buildLearningMaterialAccessPath(materialId),
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        extractionStatus: "completed",
        extractionError: null,
        indexingStatus: "processing",
        indexingError: null,
        extractedText,
        analysis,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    currentStage = "pack_build";
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "processing",
      stage: "pack_build",
      materialId,
    });

    await indexMaterialAndSyncBoundary({
      topicId: data.topicId,
      materialId,
      material,
      mimeType: data.mimeType,
      extractedText,
      analysis,
      topic,
    });

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "succeeded",
      stage: "pack_build",
      userMessage: null,
      internalError: null,
      errorCode: null,
      retryable: null,
      failedAt: null,
      completedAt: new Date(),
      failureMessage: null,
      materialId,
    });

    return { success: true, materialId };
  } catch (error) {
    const failure = buildUploadAttemptFailure(currentStage, error);

    await deleteMaterialProcessingArtifacts({
      materialId,
      storagePath: attempt.storagePath ?? data.storagePath,
      deleteSourceFile: false,
    });

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "failed",
      stage: currentStage,
      userMessage: failure.userMessage,
      internalError: failure.internalError,
      errorCode: failure.errorCode,
      retryable: failure.retryable,
      failedAt: failure.failedAt,
      completedAt: null,
      failureMessage: failure.failureMessage,
      materialId: null,
    });

    return {
      success: false,
      error: failure.internalError,
      userMessage: failure.userMessage,
      retryable: failure.retryable,
    };
  }
}
