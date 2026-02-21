
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
  env.convy_supabase_secret_key!,
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
  kind: "image" | "audio" | "video"
): Promise<{ url: string; path: string }> {
  // Use distinct extensions if needed, but keeping original logic for now
  const ext = contentType.split("/")[1] || "bin";
  
  // Naming convention: surveyId/assetId.ext (simpler structure within buckets)
  // Original was: surveyId/kind/assetId.ext - but with separate buckets we can just do surveyId/assetId.ext
  // However, keeping surveyId as a folder is good organization.
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
 * @param path - The storage path of the asset
 * @param kind - "image" | "audio" | "video"
 */
export async function deleteSurveyMedia(
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
 * Delete all media (images, audio, video) for a survey from all buckets
 * @param surveyId - The survey ID
 */
export async function clearSurveyMedia(surveyId: string): Promise<void> {
  const buckets = [SURVEY_IMAGES_BUCKET, SURVEY_AUDIO_BUCKET, SURVEY_VIDEO_BUCKET];
  
  await Promise.all(
    buckets.map(async (bucket) => {
      const { data: files, error: listError } = await supabase.storage
        .from(bucket)
        .list(surveyId);

      if (listError) {
        console.error(`Failed to list files in bucket ${bucket} for survey ${surveyId}:`, listError);
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
        console.error(`Failed to delete files in bucket ${bucket}:`, deleteError);
      }
    })
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

