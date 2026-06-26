import {
  TUTORING_STATUS,
  MATERIAL_UPLOAD_ATTEMPT_STAGE_VALUES,
  MATERIAL_UPLOAD_ATTEMPT_STATUS_VALUES,
} from "@/shared/tutoring/constants";

export type LearningMaterialUploadAttemptStatus =
  (typeof MATERIAL_UPLOAD_ATTEMPT_STATUS_VALUES)[number];

export type LearningMaterialUploadAttemptStage =
  (typeof MATERIAL_UPLOAD_ATTEMPT_STAGE_VALUES)[number];

export function normalizeLearningMaterialUploadAttemptStage(stage: string) {
  return stage;
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
    message.includes("lesson not found") ||
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
      return "This file was uploaded, but the material analysis step failed. Try again.";
    case "indexing":
      return "This file was uploaded, but saving the processed material failed. Try again.";
    case "pack_build":
      return "This file was processed, but the lesson grounding pack could not be rebuilt. Try again.";
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
    analysis?.analysisStatus === TUTORING_STATUS.materialFailed ||
    analysis?.status === TUTORING_STATUS.materialFailed ||
    typeof analysis?.analysisError === "string"
  );
}



