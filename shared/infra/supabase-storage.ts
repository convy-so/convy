import { createClient } from "@supabase/supabase-js";
import { env } from "@/shared/config/server-env";

/**
 * Supabase Storage client for uploading and managing survey images
 *
 * Bucket structure:
 * - survey-images/{surveyId}/{imageId}.{ext}
 */

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.convy_supabase_secret_key,
  {
    auth: {
      persistSession: false,
    },
  },
);

export const SURVEY_IMAGES_BUCKET = "survey-images";
export const SURVEY_AUDIO_BUCKET = "survey-audio";
export const SURVEY_VIDEO_BUCKET = "survey-video";
export const LEARNING_MATERIALS_BUCKET = "learning-materials";

function getUploadByteLength(file: Buffer | Blob) {
  return Buffer.isBuffer(file) ? file.byteLength : file.size;
}

function getSupabaseStorageErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return {};
  }

  const candidate = error as {
    message?: unknown;
    name?: unknown;
    statusCode?: unknown;
    error?: unknown;
  };

  return {
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    message: typeof candidate.message === "string" ? candidate.message : undefined,
    statusCode:
      typeof candidate.statusCode === "string" ||
      typeof candidate.statusCode === "number"
        ? candidate.statusCode
        : undefined,
    error: typeof candidate.error === "string" ? candidate.error : undefined,
  };
}

/**
 * Upload an image to Supabase Storage
 * @param file - The file to upload (Buffer or Blob)
 * @param surveyId - The survey this image belongs to
 * @param imageId - Unique identifier for the image
 * @param contentType - MIME type of the image
 * @returns Public URL of the uploaded image
 */
export async function uploadSurveyImage(
  file: Buffer | Blob,
  surveyId: string,
  imageId: string,
  contentType: string,
): Promise<{ path: string; bucket: string }> {
  return uploadSurveyMedia(file, surveyId, imageId, contentType, "image");
}

/**
 * Upload a media asset (image/audio/video) to Supabase Storage
 * @param file - The file to upload (Buffer or Blob)
 * @param surveyId - The survey this media belongs to
 * @param assetId - Unique identifier for the media
 * @param contentType - MIME type
 * @param kind - "image" | "audio" | "video"
 */
export async function uploadSurveyMedia(
  file: Buffer | Blob,
  surveyId: string,
  assetId: string,
  contentType: string,
  kind: "image" | "audio" | "video",
): Promise<{ path: string; bucket: string }> {
  // Map common MIME types to standard extensions to ensure clean filenames
  const mimeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };

  const ext = mimeMap[contentType] || contentType.split("/")[1] || "bin";

  const filePath = `${surveyId}/${assetId}.${ext}`;

  const bucket =
    kind === "audio"
      ? SURVEY_AUDIO_BUCKET
      : kind === "video"
        ? SURVEY_VIDEO_BUCKET
        : SURVEY_IMAGES_BUCKET;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload ${kind}: ${error.message}`);
  }
  return {
    path: data.path,
    bucket,
  };
}

export async function uploadLearningMaterial(
  file: Buffer | Blob,
  topicId: string,
  assetId: string,
  contentType: string,
  originalFilename: string,
): Promise<{ path: string; bucket: string }> {
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${topicId}/${assetId}-${safeName}`;

  console.info("[learning-material-storage] upload start", {
    bucket: LEARNING_MATERIALS_BUCKET,
    path: filePath,
    topicId,
    assetId,
    contentType,
    sizeBytes: getUploadByteLength(file),
  });

  const { data, error } = await supabase.storage
    .from(LEARNING_MATERIALS_BUCKET)
    .upload(filePath, file, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error("[learning-material-storage] upload failed", {
      bucket: LEARNING_MATERIALS_BUCKET,
      path: filePath,
      topicId,
      assetId,
      contentType,
      sizeBytes: getUploadByteLength(file),
      error: getSupabaseStorageErrorDetails(error),
    });
    throw new Error(`Failed to upload learning material: ${error.message}`);
  }

  console.info("[learning-material-storage] upload complete", {
    bucket: LEARNING_MATERIALS_BUCKET,
    path: data.path,
    topicId,
    assetId,
    contentType,
    sizeBytes: getUploadByteLength(file),
  });

  return {
    path: data.path,
    bucket: LEARNING_MATERIALS_BUCKET,
  };
}

export async function createSignedSurveyMediaUrl(
  path: string,
  kind: "image" | "audio" | "video",
  expiresInSeconds: number = 60,
): Promise<string> {
  const bucket =
    kind === "audio"
      ? SURVEY_AUDIO_BUCKET
      : kind === "video"
        ? SURVEY_VIDEO_BUCKET
        : SURVEY_IMAGES_BUCKET;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed survey media URL: ${error?.message ?? "Missing signed URL"}`);
  }

  return data.signedUrl;
}

export async function createSignedLearningMaterialUrl(
  path: string,
  expiresInSeconds: number = 60,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(LEARNING_MATERIALS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed learning material URL: ${error?.message ?? "Missing signed URL"}`);
  }

  return data.signedUrl;
}

export async function downloadLearningMaterial(path: string): Promise<Buffer> {
  console.info("[learning-material-storage] download start", {
    bucket: LEARNING_MATERIALS_BUCKET,
    path,
  });

  const { data, error } = await supabase.storage
    .from(LEARNING_MATERIALS_BUCKET)
    .download(path);

  if (error || !data) {
    console.error("[learning-material-storage] download failed", {
      bucket: LEARNING_MATERIALS_BUCKET,
      path,
      error: error ? getSupabaseStorageErrorDetails(error) : null,
    });
    throw new Error(`Failed to download learning material: ${error?.message ?? "Missing file"}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  console.info("[learning-material-storage] download complete", {
    bucket: LEARNING_MATERIALS_BUCKET,
    path,
    sizeBytes: buffer.byteLength,
  });

  return buffer;
}

/**
 * Delete an image from Supabase Storage
 * @param path - The storage path of the image (e.g., "surveyId/imageId.png")
 */
export async function deleteSurveyImage(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(SURVEY_IMAGES_BUCKET)
    .remove([path]);

  if (error) {
    throw new Error(`Failed to delete image: ${error.message}`);
  }
}

/**
 * Delete a media asset from Supabase Storage
 * @param path - The storage path of the asset
 * @param kind - "image" | "audio" | "video"
 */
export async function deleteSurveyMedia(
  path: string,
  kind: "image" | "audio" | "video",
): Promise<void> {
  const bucket =
    kind === "audio"
      ? SURVEY_AUDIO_BUCKET
      : kind === "video"
        ? SURVEY_VIDEO_BUCKET
        : SURVEY_IMAGES_BUCKET;

  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    throw new Error(`Failed to delete media: ${error.message}`);
  }
}

export async function deleteLearningMaterial(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(LEARNING_MATERIALS_BUCKET)
    .remove([path]);

  if (error) {
    throw new Error(`Failed to delete learning material: ${error.message}`);
  }
}

/**
 * Delete all media (images, audio, video) for a survey from all buckets
 * @param surveyId - The survey ID
 */
export async function clearSurveyMedia(surveyId: string): Promise<void> {
  const buckets = [
    SURVEY_IMAGES_BUCKET,
    SURVEY_AUDIO_BUCKET,
    SURVEY_VIDEO_BUCKET,
  ];

  await Promise.all(
    buckets.map(async (bucket) => {
      const { data: files, error: listError } = await supabase.storage
        .from(bucket)
        .list(surveyId);

      if (listError) {
        return;
      }

      if (!files || files.length === 0) {
        return;
      }

      const filePaths = files.map((file) => `${surveyId}/${file.name}`);
      const { error: deleteError } = await supabase.storage
        .from(bucket)
        .remove(filePaths);

      if (deleteError) {
      }
    }),
  );
}

// Deprecated: Alias for clearSurveyMedia for backward compatibility if needed,
// otherwise can be removed if strictly following "no backward compatibility".
// Keeping it as a wrapper to avoid breaking if mistakenly called,
// but clearSurveyMedia is preferred.
export async function deleteSurveyImages(surveyId: string): Promise<void> {
  await clearSurveyMedia(surveyId);
}

/**
 * Validate image file
 * @param file - The file to validate
 * @param maxSizeMB - Maximum file size in megabytes (default: 5MB)
 */
export function validateImageFile(
  file: File,
  maxSizeMB: number = 5,
): { valid: boolean; error?: string } {
  const validTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: "Invalid file type. Allowed types: JPEG, PNG, GIF, WebP",
    };
  }

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds ${maxSizeMB}MB limit`,
    };
  }

  return { valid: true };
}

