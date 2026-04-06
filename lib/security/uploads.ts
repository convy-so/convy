const MB = 1024 * 1024;

export const MAX_AUDIO_UPLOAD_BYTES = 8 * MB;
export const MAX_LEARNING_MATERIAL_BYTES = 12 * MB;
export const MAX_TEXT_EXTRACTION_CHARS = 120_000;

type FileLike = {
  name: string;
  size: number;
  type?: string | null;
};

export const LEARNING_MATERIAL_MIME_ALLOWLIST = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

const LEARNING_MATERIAL_EXTENSION_ALLOWLIST = new Set([
  "pdf",
  "txt",
  "md",
  "csv",
  "json",
]);

export const AUDIO_MIME_ALLOWLIST = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
]);

function getFileExtension(filename: string) {
  const lastPart = filename.split(".").pop()?.trim().toLowerCase();
  return lastPart && lastPart !== filename.toLowerCase() ? lastPart : null;
}

export function assertFileSize(file: FileLike, maxBytes: number, label: string) {
  if (file.size > maxBytes) {
    throw new Error(`${label} exceeds the ${Math.round(maxBytes / MB)}MB limit`);
  }
}

export function assertAudioUploadFile(file: FileLike, detectedMimeType?: string | null) {
  assertFileSize(file, MAX_AUDIO_UPLOAD_BYTES, "Audio upload");
  const mimeType = (detectedMimeType || file.type || "").toLowerCase();

  if (!AUDIO_MIME_ALLOWLIST.has(mimeType)) {
    throw new Error("Unsupported audio format");
  }
}

export function assertLearningMaterialFile(file: FileLike, detectedMimeType?: string | null) {
  assertFileSize(file, MAX_LEARNING_MATERIAL_BYTES, "Learning material");

  const mimeType = (detectedMimeType || file.type || "").toLowerCase();
  const extension = getFileExtension(file.name);

  if (!extension || !LEARNING_MATERIAL_EXTENSION_ALLOWLIST.has(extension)) {
    throw new Error("Unsupported learning material file extension");
  }

  if (!LEARNING_MATERIAL_MIME_ALLOWLIST.has(mimeType)) {
    throw new Error("Unsupported learning material format");
  }
}

export function clampExtractedTextLength(value: string) {
  return value.length > MAX_TEXT_EXTRACTION_CHARS
    ? value.slice(0, MAX_TEXT_EXTRACTION_CHARS)
    : value;
}
