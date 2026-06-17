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
  buildMaterialGroundingMap,
  extractLearningMaterialSourceDocument,
} from "@/lib/learning/materials";
import { indexLearningMaterialEvidence } from "@/lib/learning/evidence";
import { buildLearningMaterialAccessPath } from "@/lib/media-access";
import {
  deleteLearningMaterial,
  downloadLearningMaterial,
} from "@/lib/storage";
import { rebuildTopicGroundingPack } from "@/lib/learning/topic-grounding-pack-service";
import { topicSourceBoundarySchema } from "@/lib/learning/types";
import { publishClassroomRealtimeEvent } from "@/lib/realtime";
import {
  enqueueLearningMaterialBatchFinalize,
  type LearningMaterialBatchFinalizeJobData,
  type LearningMaterialProcessingJobData,
} from "@/lib/queue";

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

export function normalizeLearningMaterialUploadAttemptStage(stage: string) {
  return stage === "review" ? "analysis" : stage;
}

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
  const message = getErrorMessage(error, "").toLowerCase();

  if (message.includes("unsupported learning material format")) {
    return "This file format is not supported. Upload a PDF, DOCX, or TXT file.";
  }

  if (
    message.includes("queue_enqueue") ||
    message.includes("attempt_queue_update") ||
    message.includes("enqueue")
  ) {
    return "This file was uploaded, but processing could not be queued. Try again.";
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

export type MaterialBatchGateState =
  | {
      batchId: null;
      status: "idle";
      attemptCount: 0;
      succeededCount: 0;
      failedCount: 0;
      processingCount: 0;
      materialIds: string[];
    }
  | {
      batchId: string;
      status: "processing" | "failed" | "succeeded";
      attemptCount: number;
      succeededCount: number;
      failedCount: number;
      processingCount: number;
      materialIds: string[];
    };

function getActiveBatchAttempts<T extends {
  id?: string;
  previousAttemptId?: string | null;
  batchId: string;
}>(attempts: T[]) {
  if (attempts.length === 0) return [];
  const latestBatchId = [...attempts]
    .sort(
      (left, right) =>
        new Date((right as { createdAt?: Date | string | null }).createdAt ?? 0).getTime() -
        new Date((left as { createdAt?: Date | string | null }).createdAt ?? 0).getTime(),
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
      status: "idle",
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
  const latestBatchId = sorted[0]?.batchId;
  const latestBatchAttempts = getActiveBatchAttempts(
    sorted.filter((attempt) => attempt.batchId === latestBatchId),
  );
  const succeededCount = latestBatchAttempts.filter(
    (attempt) => attempt.status === "succeeded",
  ).length;
  const failedCount = latestBatchAttempts.filter(
    (attempt) => attempt.status === "failed",
  ).length;
  const processingCount = latestBatchAttempts.filter(
    (attempt) => attempt.status === "queued" || attempt.status === "processing",
  ).length;

  return {
    batchId: latestBatchId ?? null,
    status:
      processingCount > 0
        ? "processing"
        : failedCount > 0
          ? "failed"
          : "succeeded",
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
        material.extractionStatus === "completed" &&
        material.indexingStatus === "completed" &&
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
      .filter((attempt) => attempt.status === "failed")
      .every((attempt) => attempt.stage === "pack_build");

  if (batch.status === "processing") {
    return {
      ready: false,
      reason:
        batch.attemptCount === 1
          ? "Activation is locked until the uploaded material finishes processing."
          : `Activation is locked until all ${batch.attemptCount} files in the current upload batch finish processing.`,
    };
  }

  if (batch.status === "failed") {
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
  sourceDocument: Record<string, unknown>;
  groundingMap: Record<string, unknown>;
  topic: NonNullable<Awaited<ReturnType<typeof getTeacherTopicAccess>>>;
}) {
  const currentTopic = await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, params.topicId),
    columns: { sourceBoundary: true },
  });
  const existingBoundary = topicSourceBoundarySchema.parse(currentTopic?.sourceBoundary ?? {});
  const updatedBoundary = topicSourceBoundarySchema.parse({
    ...existingBoundary,
    rigorNotes: Array.from(
      new Set([
        ...(existingBoundary.rigorNotes || []),
        ...((params.analysis.rigorNotes as string[]) || []),
        ...((params.groundingMap.rigorRules as string[]) || []),
      ]),
    ),
    notationNotes: Array.from(
      new Set([
        ...(existingBoundary.notationNotes || []),
        ...((params.analysis.notationNotes as string[]) || []),
        ...((params.groundingMap.notationRules as string[]) || []),
      ]),
    ),
    scopeNotes: Array.from(
      new Set([
        ...(existingBoundary.scopeNotes || []),
        ...((params.analysis.scopeNotes as string[]) || []),
        ...((params.groundingMap.scopeRules as string[]) || []),
      ]),
    ),
  });

  await indexLearningMaterialEvidence({
    materialId: params.materialId,
    topicId: params.topicId,
    classroomId: params.topic.classroomId,
    language: params.topic.contentLocale,
    subjectKey: params.topic.courseId,
    gradeBand: params.topic.classroom.gradeBand,
    sourceTitle: params.material.title,
    sourceUpdatedAt: params.material.updatedAt ?? new Date(),
    sourceDocument: params.sourceDocument,
    groundingMap: params.groundingMap,
  });

  await Promise.all([
    getDb().update(topicMaterials).set({ indexingStatus: "completed", indexingError: null, updatedAt: new Date() }).where(eq(topicMaterials.id, params.materialId)),
    getDb().update(learningTopics).set({ sourceBoundary: updatedBoundary, lastMaterialSyncAt: new Date(), updatedAt: new Date() }).where(eq(learningTopics.id, params.topicId)),
  ]);
}

function buildMaterialAnalysisPreview(params: {
  groundingMap: Record<string, unknown>;
}) {
  const overview =
    typeof params.groundingMap.overview === "string"
      ? params.groundingMap.overview
      : "";
  const scopeRules = Array.isArray(params.groundingMap.scopeRules)
    ? (params.groundingMap.scopeRules as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const notationRules = Array.isArray(params.groundingMap.notationRules)
    ? (params.groundingMap.notationRules as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const rigorRules = Array.isArray(params.groundingMap.rigorRules)
    ? (params.groundingMap.rigorRules as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const ambiguities = Array.isArray(params.groundingMap.ambiguities)
    ? (params.groundingMap.ambiguities as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  return {
    summary: overview || "Material grounded successfully.",
    groundingSummary: overview,
    supportedOutcomes: [],
    partialOutcomes: [],
    unsupportedOutcomes: [],
    clarifyingQuestions: [],
    coverageObservations: [...scopeRules, ...ambiguities].slice(0, 6),
    recommendedOutcomeEdits: [],
    rigorNotes: rigorRules.slice(0, 6),
    notationNotes: notationRules.slice(0, 6),
    scopeNotes: scopeRules.slice(0, 6),
  };
}

function isFileTerminalAttempt(attempt: {
  status: string;
  materialId?: string | null;
}) {
  if (attempt.status === "failed" || attempt.status === "succeeded") {
    return true;
  }

  return attempt.status === "processing" && Boolean(attempt.materialId);
}

function buildLatestBatchLeafState(
  attempts: Array<typeof topicMaterialUploadAttempts.$inferSelect>,
) {
  const activeAttempts = getActiveBatchAttempts(attempts);
  const failedAttempts = activeAttempts.filter((attempt) => attempt.status === "failed");
  const incompleteAttempts = activeAttempts.filter((attempt) => !isFileTerminalAttempt(attempt));
  const successfulAttempts = activeAttempts.filter(
    (attempt) => attempt.status !== "failed" && Boolean(attempt.materialId),
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
          status: "succeeded",
          stage: "pack_build",
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
        status: "succeeded",
        stage: "pack_build",
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
  const failure = buildUploadAttemptFailure("pack_build", error);

  await Promise.all(
    successfulAttempts.map((attempt) =>
      updateLearningMaterialUploadAttempt({
        attemptId: attempt.id,
        classroomId: data.classroomId,
        topicId: attempt.topicId,
        batchId: attempt.batchId,
        status: "failed",
        stage: "pack_build",
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
  const startedAt = Date.now();
  const attempt = await getDb().query.topicMaterialUploadAttempts.findFirst({
    where: eq(topicMaterialUploadAttempts.id, data.attemptId),
  });

  if (!attempt || attempt.status === "succeeded") {
    return { success: true, skipped: "missing_or_completed" as const };
  }

  let materialId: string | null = null;
  let currentStage: LearningMaterialUploadAttemptStage = "extraction";

  try {
    console.info("[learning-material-worker] processing start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      classroomId: data.classroomId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
    });

    console.info("[learning-material-worker] topic access check start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      userId: data.userId,
    });
    const topic = await getTeacherTopicAccess(data.userId, data.topicId);
    if (!topic) {
      throw new Error("Topic not found or user is no longer authorized.");
    }
    console.info("[learning-material-worker] topic access check complete", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      classroomId: topic.classroomId,
    });

    if (!attempt.storagePath) {
      throw new Error("Uploaded file could not be found for processing.");
    }

    console.info("[learning-material-worker] marking extraction started", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      storagePath: attempt.storagePath,
    });
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

    materialId = nanoid();
    console.info("[learning-material-worker] download start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      storagePath: attempt.storagePath,
      materialId,
    });
    const buffer = await downloadLearningMaterial(attempt.storagePath);
    console.info("[learning-material-worker] download complete", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      storagePath: attempt.storagePath,
      materialId,
      sizeBytes: buffer.byteLength,
    });

    console.info("[learning-material-worker] extraction start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
      mimeType: data.mimeType,
    });
    const sourceDocument = await extractLearningMaterialSourceDocument({
      materialId,
      buffer,
      filename: data.fileName,
      mimeType: data.mimeType,
      title: data.title,
      traceId: data.attemptId,
      topicId: data.topicId,
    });
    const extractedText = sourceDocument.extractedText;

    console.info("[learning-material-worker] extraction complete", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      extractedTextLength: extractedText.length,
      segmentCount: sourceDocument.segments.length,
    });

    currentStage = "analysis";
    console.info("[learning-material-worker] marking analysis started", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "processing",
      stage: "analysis",
    });

    console.info("[learning-material-worker] grounding map start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
      segmentCount: sourceDocument.segments.length,
    });
    const groundingMap = await buildMaterialGroundingMap({
      topicTitle: topic.title,
      materialId,
      materialTitle: data.title?.trim() || data.fileName,
      sourceDocument,
      traceId: data.attemptId,
      topicId: data.topicId,
    });

    const analysis = buildMaterialAnalysisPreview({
      groundingMap,
    });

    console.info("[learning-material-worker] analysis complete", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      analysisKeys: Object.keys(analysis).join(","),
      summaryLength: typeof analysis.summary === "string" ? analysis.summary.length : 0,
      clarifyingQuestionCount: Array.isArray(analysis.clarifyingQuestions)
        ? analysis.clarifyingQuestions.length
        : 0,
    });

    if (isMaterialAnalysisFailed(analysis)) {
      throw new Error("AI material review failed for this file.");
    }

    currentStage = "indexing";
    console.info("[learning-material-worker] marking indexing started", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "processing",
      stage: "indexing",
    });

    console.info("[learning-material-worker] material insert start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });
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
        sourceDocument,
        groundingMap,
        coverageReview: analysis,
        analysis,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    console.info("[learning-material-worker] material insert complete", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });

    currentStage = "pack_build";
    console.info("[learning-material-worker] marking pack build started", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });
    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "processing",
      stage: "pack_build",
      materialId,
    });

    console.info("[learning-material-worker] indexing and boundary sync start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });
    await indexMaterialAndSyncBoundary({
      topicId: data.topicId,
      materialId,
      material,
      mimeType: data.mimeType,
      extractedText,
      analysis,
      sourceDocument,
      groundingMap,
      topic,
    });
    console.info("[learning-material-worker] indexing and boundary sync complete", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
    });

    await updateLearningMaterialUploadAttempt({
      attemptId: data.attemptId,
      classroomId: data.classroomId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      status: "processing",
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

    console.info("[learning-material-worker] batch finalizer enqueue start", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      materialId,
    });
    const finalizeJob = await enqueueLearningMaterialBatchFinalize({
      batchId: attempt.batchId,
      topicId: data.topicId,
      classroomId: data.classroomId,
    });
    console.info("[learning-material-worker] batch finalizer enqueued", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      batchId: attempt.batchId,
      materialId,
      jobId: finalizeJob?.id ?? null,
    });

    console.info("[learning-material-worker] processing succeeded", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      materialId,
      durationMs: Date.now() - startedAt,
    });

    return { success: true, materialId };
  } catch (error) {
    const failure = buildUploadAttemptFailure(currentStage, error);

    console.error("[learning-material-worker] processing failed", {
      attemptId: data.attemptId,
      topicId: data.topicId,
      stage: currentStage,
      durationMs: Date.now() - startedAt,
      error: failure.internalError,
      retryable: failure.retryable,
    });

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
