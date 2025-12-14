import "server-only";

import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Supabase Storage client for uploading and managing survey images
 * 
 * Bucket structure:
 * - survey-images/{surveyId}/{imageId}.{ext}
 */

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
    },
  }
);

export const SURVEY_IMAGES_BUCKET = "survey-images";
export const SURVEY_AUDIO_BUCKET = "survey-audio";
export const SURVEY_VIDEO_BUCKET = "survey-video";

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
  contentType: string
): Promise<{ url: string; path: string }> {
  return uploadSurveyAsset(file, surveyId, imageId, contentType, "image");
}

/**
 * Upload a media asset (image/audio/video) to Supabase Storage
 * @param file - The file to upload (Buffer or Blob)
 * @param surveyId - The survey this media belongs to
 * @param assetId - Unique identifier for the media
 * @param contentType - MIME type
 * @param kind - "image" | "audio" | "video"
 */
export async function uploadSurveyAsset(
  file: Buffer | Blob,
  surveyId: string,
  assetId: string,
  contentType: string,
  kind: "image" | "audio" | "video"
): Promise<{ url: string; path: string }> {
  const ext = contentType.split("/")[1] || "bin";
  const filePath = `${surveyId}/${kind}/${assetId}.${ext}`;

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
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return {
    url: urlData.publicUrl,
    path: data.path,
  };
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
 * @param path - The storage path of the asset (e.g., "surveyId/video/{id}.mp4")
 */
export async function deleteSurveyAsset(
  path: string,
  kind: "image" | "audio" | "video"
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

/**
 * Delete all images for a survey
 * @param surveyId - The survey ID
 */
export async function deleteSurveyImages(surveyId: string): Promise<void> {
  const { data: files, error: listError } = await supabase.storage
    .from(SURVEY_IMAGES_BUCKET)
    .list(surveyId);

  if (listError) {
    throw new Error(`Failed to list images: ${listError.message}`);
  }

  if (!files || files.length === 0) {
    return;
  }

  const filePaths = files.map((file) => `${surveyId}/${file.name}`);
  const { error: deleteError } = await supabase.storage
    .from(SURVEY_IMAGES_BUCKET)
    .remove(filePaths);

  if (deleteError) {
    throw new Error(`Failed to delete images: ${deleteError.message}`);
  }
}

/**
 * Validate image file
 * @param file - The file to validate
 * @param maxSizeMB - Maximum file size in megabytes (default: 5MB)
 */
export function validateImageFile(
  file: File,
  maxSizeMB: number = 5
): { valid: boolean; error?: string } {
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
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

