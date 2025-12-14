"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { surveys, type SurveyImage, type SurveyMedia } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  uploadSurveyImage,
  uploadSurveyAsset,
  deleteSurveyImage,
  deleteSurveyAsset,
} from "@/lib/storage";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const addSurveyImageSchema = z.object({
  surveyId: z.string().min(1),
  url: z.string().url("Invalid image URL"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  contextForUse: z.string().min(10, "Context for use must be at least 10 characters"),
});

const updateSurveyImageSchema = z.object({
  surveyId: z.string().min(1),
  imageId: z.string().min(1),
  url: z.string().url("Invalid image URL").optional(),
  description: z.string().min(10).optional(),
  contextForUse: z.string().min(10).optional(),
});

const removeSurveyImageSchema = z.object({
  surveyId: z.string().min(1),
  imageId: z.string().min(1),
});

const uploadSurveyImageSchema = z.object({
  surveyId: z.string().min(1),
  description: z.string().min(10, "Description must be at least 10 characters"),
  contextForUse: z.string().min(10, "Context for use must be at least 10 characters"),
});

const uploadSurveyMediaSchema = z.object({
  surveyId: z.string().min(1),
  type: z.enum(["audio", "video"]),
  description: z.string().min(10, "Description must be at least 10 characters"),
  contentSummary: z.string().min(10, "Content summary must be at least 10 characters"),
  contextForUse: z.string().min(10, "Context for use must be at least 10 characters"),
  infoToGather: z.string().min(5, "Info to gather is required"),
  durationMs: z.number().max(5 * 60 * 1000, "Duration exceeds 5 minutes"),
  mimeType: z.string().optional(),
});

const updateSurveyMediaSchema = z.object({
  surveyId: z.string().min(1),
  mediaId: z.string().min(1),
  description: z.string().min(10).optional(),
  contentSummary: z.string().min(10).optional(),
  contextForUse: z.string().min(10).optional(),
  infoToGather: z.string().min(5).optional(),
  durationMs: z.number().max(5 * 60 * 1000, "Duration exceeds 5 minutes").optional(),
  mimeType: z.string().optional(),
});

const removeSurveyMediaSchema = z.object({
  surveyId: z.string().min(1),
  mediaId: z.string().min(1),
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
    const file = formData.get("file") as File;

    const validation = uploadSurveyImageSchema.parse({
      surveyId,
      description,
      contextForUse,
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

    const { url } = await uploadSurveyImage(
      buffer,
      validation.surveyId,
      imageId,
      file.type
    );

    const newMedia: SurveyMedia = {
      id: imageId,
      url,
      type: "image",
      description: validation.description,
      contextForUse: validation.contextForUse,
      contentSummary: validation.description,
      infoToGather: validation.contextForUse,
      durationMs: null,
      mimeType: file.type,
    };

    const updatedMedia = [...(survey.media || []), newMedia];

    await db
      .update(surveys)
      .set({ media: updatedMedia })
      .where(eq(surveys.id, validation.surveyId));

    return {
      success: true,
      data: { imageId, image: newMedia },
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
 * Upload an audio or video file to Supabase Storage and add it to the survey media list
 * Enforces a 5-minute max duration and required descriptive metadata
 */
export async function uploadSurveyMediaAction(
  formData: FormData
): Promise<ActionResult<{ mediaId: string; media: SurveyMedia }>> {
  try {
    const session = await getVerifiedSession();

    const surveyId = formData.get("surveyId") as string;
    const type = formData.get("type") as "audio" | "video";
    const description = formData.get("description") as string;
    const contentSummary = formData.get("contentSummary") as string;
    const contextForUse = formData.get("contextForUse") as string;
    const infoToGather = formData.get("infoToGather") as string;
    const durationMs = Number(formData.get("durationMs"));
    const file = formData.get("file") as File;

    const validation = uploadSurveyMediaSchema.parse({
      surveyId,
      type,
      description,
      contentSummary,
      contextForUse,
      infoToGather,
      durationMs,
      mimeType: file?.type,
    });

    if (!file || !(file instanceof File)) {
      return { success: false, error: "No file provided" };
    }

    const audioTypes = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4"];
    const videoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/ogg"];
    const allowedTypes = validation.type === "audio" ? audioTypes : videoTypes;

    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error:
          validation.type === "audio"
            ? "Invalid file type. Allowed audio types: MP3, WAV, OGG, WEBM, MP4"
            : "Invalid file type. Allowed video types: MP4, WEBM, MOV, OGG",
      };
    }

    // Size guard: allow up to ~100MB for media (rough heuristic); adjust as needed
    const maxSizeMB = 100;
    if (file.size > maxSizeMB * 1024 * 1024) {
      return { success: false, error: `File size exceeds ${maxSizeMB}MB limit` };
    }

    const [survey] = await db.select().from(surveys).where(eq(surveys.id, validation.surveyId));

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
        error: "Cannot upload media to survey in current status",
      };
    }

    const mediaId = nanoid();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { url } = await uploadSurveyAsset(
      buffer,
      validation.surveyId,
      mediaId,
      file.type,
      validation.type
    );

    const newMedia: SurveyMedia = {
      id: mediaId,
      url,
      type: validation.type,
      description: validation.description,
      contentSummary: validation.contentSummary,
      contextForUse: validation.contextForUse,
      infoToGather: validation.infoToGather,
      durationMs: validation.durationMs,
      mimeType: validation.mimeType || file.type,
    };

    const updatedMedia = [...(survey.media || []), newMedia];

    await db
      .update(surveys)
      .set({ media: updatedMedia })
      .where(eq(surveys.id, validation.surveyId));

    return {
      success: true,
      data: { mediaId, media: newMedia },
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
    return { success: false, error: "Failed to upload media" };
  }
}

/**
 * Update media metadata (audio/video/image) for a survey
 */
export async function updateSurveyMediaAction(
  input: z.infer<typeof updateSurveyMediaSchema>
): Promise<ActionResult<{ media: SurveyMedia }>> {
  try {
    const session = await getVerifiedSession();
    const body = updateSurveyMediaSchema.parse(input);

    const [survey] = await db.select().from(surveys).where(eq(surveys.id, body.surveyId));
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
        error: "Cannot update media in survey with current status",
      };
    }

    const currentMedia = survey.media || [];
    const mediaIndex = currentMedia.findIndex((m) => m.id === body.mediaId);
    if (mediaIndex === -1) {
      return { success: false, error: "Media not found" };
    }

    const durationMsUpdate =
      body.durationMs !== undefined ? Math.min(body.durationMs, 5 * 60 * 1000) : undefined;

    const updatedMedia: SurveyMedia = {
      ...currentMedia[mediaIndex],
      ...(body.description && { description: body.description }),
      ...(body.contentSummary && { contentSummary: body.contentSummary }),
      ...(body.contextForUse && { contextForUse: body.contextForUse }),
      ...(body.infoToGather && { infoToGather: body.infoToGather }),
      ...(durationMsUpdate !== undefined && { durationMs: durationMsUpdate }),
      ...(body.mimeType && { mimeType: body.mimeType }),
    };

    const newMediaArray = [...currentMedia];
    newMediaArray[mediaIndex] = updatedMedia;

    await db
      .update(surveys)
      .set({ media: newMediaArray })
      .where(eq(surveys.id, body.surveyId));

    return { success: true, data: { media: updatedMedia } };
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
    return { success: false, error: "Failed to update media" };
  }
}

/**
 * Remove media (audio/video/image) from a survey
 */
export async function removeSurveyMediaAction(
  input: z.infer<typeof removeSurveyMediaSchema>
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const session = await getVerifiedSession();
    const body = removeSurveyMediaSchema.parse(input);

    const [survey] = await db.select().from(surveys).where(eq(surveys.id, body.surveyId));
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
        error: "Cannot remove media from survey with current status",
      };
    }

    const currentMedia = survey.media || [];
    const mediaToRemove = currentMedia.find((m) => m.id === body.mediaId);
    if (!mediaToRemove) {
      return { success: false, error: "Media not found" };
    }

    // Delete from storage if URL matches our buckets
    try {
      const pathSegment = mediaToRemove.url.split("/storage/v1/object/public/")[1];
      if (pathSegment) {
        if (pathSegment.startsWith("survey-images/")) {
          const storagePath = pathSegment.replace("survey-images/", "");
          await deleteSurveyImage(storagePath);
        } else if (pathSegment.startsWith("survey-audio/")) {
          const storagePath = pathSegment.replace("survey-audio/", "");
          await deleteSurveyAsset(storagePath, "audio");
        } else if (pathSegment.startsWith("survey-video/")) {
          const storagePath = pathSegment.replace("survey-video/", "");
          await deleteSurveyAsset(storagePath, "video");
        }
      }
    } catch (storageError) {
      console.error("Failed to delete media from storage:", storageError);
    }

    const updatedMedia = currentMedia.filter((m) => m.id !== body.mediaId);

    await db
      .update(surveys)
      .set({ media: updatedMedia })
      .where(eq(surveys.id, body.surveyId));

    return { success: true, data: { success: true } };
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
    return { success: false, error: "Failed to remove media" };
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
    const newMedia: SurveyMedia = {
      id: imageId,
      url: body.url,
      type: "image",
      description: body.description,
      contextForUse: body.contextForUse,
      contentSummary: body.description,
      infoToGather: body.contextForUse,
      durationMs: null,
    };

    const updatedMedia = [...(survey.media || []), newMedia];

    await db
      .update(surveys)
      .set({ media: updatedMedia })
      .where(eq(surveys.id, body.surveyId));

    return {
      success: true,
      data: { imageId, image: newMedia },
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

    const currentMedia = survey.media || [];
    const mediaIndex = currentMedia.findIndex(
      (m) => m.id === body.imageId && m.type === "image"
    );

    if (mediaIndex === -1) {
      return { success: false, error: "Image not found" };
    }

    const updatedMedia: SurveyMedia = {
      ...currentMedia[mediaIndex],
      ...(body.url && { url: body.url }),
      ...(body.description && { 
        description: body.description,
        contentSummary: body.description,
      }),
      ...(body.contextForUse && { 
        contextForUse: body.contextForUse,
        infoToGather: body.contextForUse,
      }),
    };

    const newMediaArray = [...currentMedia];
    newMediaArray[mediaIndex] = updatedMedia;

    await db
      .update(surveys)
      .set({ media: newMediaArray })
      .where(eq(surveys.id, body.surveyId));

    return {
      success: true,
      data: { image: updatedMedia },
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

    const currentMedia = survey.media || [];
    const imageToRemove = currentMedia.find(
      (m) => m.id === body.imageId && m.type === "image"
    );
    
    if (!imageToRemove) {
      return { success: false, error: "Image not found" };
    }

    // Delete from Supabase Storage if it's a storage URL
    try {
      const pathSegment = imageToRemove.url.split("/storage/v1/object/public/")[1];
      if (pathSegment) {
        if (pathSegment.startsWith("survey-images/")) {
          const storagePath = pathSegment.replace("survey-images/", "");
          await deleteSurveyImage(storagePath);
        } else if (pathSegment.startsWith("survey-audio/")) {
          const storagePath = pathSegment.replace("survey-audio/", "");
          await deleteSurveyAsset(storagePath, "audio");
        } else if (pathSegment.startsWith("survey-video/")) {
          const storagePath = pathSegment.replace("survey-video/", "");
          await deleteSurveyAsset(storagePath, "video");
        }
      }
    } catch (storageError) {
      console.error("Failed to delete image from storage:", storageError);
    }

    const updatedMedia = currentMedia.filter((m) => m.id !== body.imageId);

    await db
      .update(surveys)
      .set({ media: updatedMedia })
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

    const images = (survey.media || []).filter((m) => m.type === "image");
    return {
      success: true,
      data: { images },
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

    const currentMedia = survey.media || [];
    const currentImages = currentMedia.filter((m) => m.type === "image");

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
    
    // Reorder media array: put reordered images first, then other media
    const otherMedia = currentMedia.filter((m) => m.type !== "image");
    const reorderedMedia = [...reorderedImages, ...otherMedia];

    await db
      .update(surveys)
      .set({ media: reorderedMedia })
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

