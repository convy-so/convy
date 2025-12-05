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
  const ext = contentType.split("/")[1] || "png";
  const filePath = `${surveyId}/${imageId}.${ext}`;

  const { data, error } = await supabase.storage
    .from(SURVEY_IMAGES_BUCKET)
    .upload(filePath, file, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload image: ${error.message}`);
  }
  const { data: urlData } = supabase.storage
    .from(SURVEY_IMAGES_BUCKET)
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

