"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { surveys, type SurveyImage } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { uploadSurveyImage, deleteSurveyImage } from "@/lib/storage";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const addSurveyImageSchema = z.object({
  surveyId: z.string().min(1),
  url: z.string().url("Invalid image URL"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  contextForUse: z.string().min(10, "Context for use must be at least 10 characters"),
  placementInConversation: z.string().min(5, "Placement instructions are required"),
});

const updateSurveyImageSchema = z.object({
  surveyId: z.string().min(1),
  imageId: z.string().min(1),
  url: z.string().url("Invalid image URL").optional(),
  description: z.string().min(10).optional(),
  contextForUse: z.string().min(10).optional(),
  placementInConversation: z.string().min(5).optional(),
});

const removeSurveyImageSchema = z.object({
  surveyId: z.string().min(1),
  imageId: z.string().min(1),
});

const uploadSurveyImageSchema = z.object({
  surveyId: z.string().min(1),
  description: z.string().min(10, "Description must be at least 10 characters"),
  contextForUse: z.string().min(10, "Context for use must be at least 10 characters"),
  placementInConversation: z.string().min(5, "Placement instructions are required"),
});

/**
 * Upload an image file to Supabase Storage and add it to the survey
 * This is the primary way to add images to surveys
 * @param formData - FormData containing the image file and metadata
 */
export async function uploadSurveyImageAction(
  formData: FormData
): Promise<ActionResult<{ imageId: string; image: SurveyImage }>> {
  try {
    const session = await getVerifiedSession();

    const surveyId = formData.get("surveyId") as string;
    const description = formData.get("description") as string;
    const contextForUse = formData.get("contextForUse") as string;
    const placementInConversation = formData.get("placementInConversation") as string;
    const file = formData.get("file") as File;

    const validation = uploadSurveyImageSchema.parse({
      surveyId,
      description,
      contextForUse,
      placementInConversation,
    });

    if (!file || !(file instanceof File)) {
      return { success: false, error: "No file provided" };
    }

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return {
        success: false,
        error: "Invalid file type. Allowed types: JPEG, PNG, GIF, WebP",
      };
    }

    const maxSizeMB = 5;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return {
        success: false,
        error: `File size exceeds ${maxSizeMB}MB limit`,
      };
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, validation.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (
      survey.status !== "draft" &&
      survey.status !== "creating" &&
      survey.status !== "sample_review"
    ) {
      return {
        success: false,
        error: "Cannot upload images to survey in current status",
      };
    }

    const imageId = nanoid();

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { url, path } = await uploadSurveyImage(
      buffer,
      validation.surveyId,
      imageId,
      file.type
    );

    const newImage: SurveyImage = {
      id: imageId,
      url,
      description: validation.description,
      contextForUse: validation.contextForUse,
      placementInConversation: validation.placementInConversation,
    };

    const updatedImages = [...(survey.images || []), newImage];

    await db
      .update(surveys)
      .set({ images: updatedImages })
      .where(eq(surveys.id, validation.surveyId));

    return {
      success: true,
      data: { imageId, image: newImage },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to upload image" };
  }
}

/**
 * Add an image to a survey for use in conversations
 * The survey maker provides the image URL, description, and context for when to use it
 * @deprecated Use uploadSurveyImageAction for uploading files. This is kept for external URL references.
 */
export async function addSurveyImageAction(
  input: z.infer<typeof addSurveyImageSchema>
): Promise<ActionResult<{ imageId: string; image: SurveyImage }>> {
  try {
    const session = await getVerifiedSession();
    const body = addSurveyImageSchema.parse(input);

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (survey.status !== "draft" && survey.status !== "creating" && survey.status !== "sample_review") {
      return {
        success: false,
        error: "Cannot add images to survey in current status",
      };
    }

    const imageId = nanoid();
    const newImage: SurveyImage = {
      id: imageId,
      url: body.url,
      description: body.description,
      contextForUse: body.contextForUse,
      placementInConversation: body.placementInConversation,
    };

    const currentImages = survey.images || [];
    const updatedImages = [...currentImages, newImage];

    await db
      .update(surveys)
      .set({ images: updatedImages })
      .where(eq(surveys.id, body.surveyId));

    return {
      success: true,
      data: { imageId, image: newImage },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to add image" };
  }
}

/**
 * Update an existing survey image
 */
export async function updateSurveyImageAction(
  input: z.infer<typeof updateSurveyImageSchema>
): Promise<ActionResult<{ image: SurveyImage }>> {
  try {
    const session = await getVerifiedSession();
    const body = updateSurveyImageSchema.parse(input);

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (survey.status !== "draft" && survey.status !== "creating" && survey.status !== "sample_review") {
      return {
        success: false,
        error: "Cannot update images in survey with current status",
      };
    }

    const currentImages = survey.images || [];
    const imageIndex = currentImages.findIndex((img) => img.id === body.imageId);

    if (imageIndex === -1) {
      return { success: false, error: "Image not found" };
    }

    const updatedImage: SurveyImage = {
      ...currentImages[imageIndex],
      ...(body.url && { url: body.url }),
      ...(body.description && { description: body.description }),
      ...(body.contextForUse && { contextForUse: body.contextForUse }),
      ...(body.placementInConversation && {
        placementInConversation: body.placementInConversation,
      }),
    };

    const updatedImages = [...currentImages];
    updatedImages[imageIndex] = updatedImage;

    await db
      .update(surveys)
      .set({ images: updatedImages })
      .where(eq(surveys.id, body.surveyId));

    return {
      success: true,
      data: { image: updatedImage },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update image" };
  }
}

/**
 * Remove an image from a survey
 */
export async function removeSurveyImageAction(
  input: z.infer<typeof removeSurveyImageSchema>
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const session = await getVerifiedSession();
    const body = removeSurveyImageSchema.parse(input);

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (survey.status !== "draft" && survey.status !== "creating" && survey.status !== "sample_review") {
      return {
        success: false,
        error: "Cannot remove images from survey with current status",
      };
    }

    const currentImages = survey.images || [];
    const imageToRemove = currentImages.find((img) => img.id === body.imageId);
    
    if (!imageToRemove) {
      return { success: false, error: "Image not found" };
    }

    // Delete from Supabase Storage if it's a storage URL
    if (imageToRemove.url.includes(body.surveyId)) {
      try {
        // Extract storage path from URL
        // URL format: https://{project}.supabase.co/storage/v1/object/public/survey-images/{surveyId}/{imageId}.{ext}
        const urlParts = imageToRemove.url.split("/survey-images/");
        if (urlParts.length > 1) {
          const storagePath = urlParts[1];
          await deleteSurveyImage(storagePath);
        }
      } catch (storageError) {
        // Log error but continue with database update
        console.error("Failed to delete image from storage:", storageError);
      }
    }

    const updatedImages = currentImages.filter((img) => img.id !== body.imageId);

    await db
      .update(surveys)
      .set({ images: updatedImages })
      .where(eq(surveys.id, body.surveyId));

    return {
      success: true,
      data: { success: true },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to remove image" };
  }
}

/**
 * Get all images for a survey
 */
export async function getSurveyImagesAction(
  surveyId: string
): Promise<ActionResult<{ images: SurveyImage[] }>> {
  try {
    const session = await getVerifiedSession();

    // Get survey and verify ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    return {
      success: true,
      data: { images: survey.images || [] },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to get images" };
  }
}

/**
 * Reorder images in a survey
 */
export async function reorderSurveyImagesAction(
  surveyId: string,
  imageIds: string[]
): Promise<ActionResult<{ images: SurveyImage[] }>> {
  try {
    const session = await getVerifiedSession();

    // Get survey and verify ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Only allow reordering in draft or creating status
    if (survey.status !== "draft" && survey.status !== "creating" && survey.status !== "sample_review") {
      return {
        success: false,
        error: "Cannot reorder images in survey with current status",
      };
    }

    const currentImages = survey.images || [];

    // Verify all image IDs exist
    const currentImageIds = new Set(currentImages.map((img) => img.id));
    const allIdsExist = imageIds.every((id) => currentImageIds.has(id));

    if (!allIdsExist || imageIds.length !== currentImages.length) {
      return {
        success: false,
        error: "Invalid image IDs provided",
      };
    }

    // Reorder images according to the provided order
    const imageMap = new Map(currentImages.map((img) => [img.id, img]));
    const reorderedImages = imageIds.map((id) => imageMap.get(id)!);

    await db
      .update(surveys)
      .set({ images: reorderedImages })
      .where(eq(surveys.id, surveyId));

    return {
      success: true,
      data: { images: reorderedImages },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to reorder images" };
  }
}

