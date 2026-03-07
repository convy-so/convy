"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys, type SurveyMedia } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { uploadSurveyMedia, deleteSurveyMedia } from "@/lib/storage";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const addSurveyMediaSchema = z.object({
  surveyId: z.string().min(1),
  url: z.string().url("Invalid media URL"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  contextForUse: z
    .string()
    .min(10, "Context for use must be at least 10 characters"),

  durationMs: z
    .number()
    .max(5 * 60 * 1000, "Duration exceeds 5 minutes")
    .optional(),
  type: z.enum(["image", "audio", "video"]).default("image"),
});

const updateSurveyMediaSchema = z.object({
  surveyId: z.string().min(1),
  mediaId: z.string().min(1),
  url: z.string().url("Invalid media URL").optional(),
  description: z.string().min(10).optional(),
  contextForUse: z.string().min(10).optional(),

  durationMs: z
    .number()
    .max(5 * 60 * 1000, "Duration exceeds 5 minutes")
    .optional(),
  mimeType: z.string().optional(),
});

const removeSurveyMediaSchema = z.object({
  surveyId: z.string().min(1),
  mediaId: z.string().min(1),
});

const uploadSurveyMediaSchema = z.object({
  surveyId: z.string().min(1),
  description: z.string().min(10, "Description must be at least 10 characters"),
  contextForUse: z
    .string()
    .min(10, "Context for use must be at least 10 characters"),

  durationMs: z.number().optional(),
  type: z.enum(["image", "audio", "video"]),
});

/**
 * Upload a media file (image/audio/video) to Supabase Storage and add it to the survey
 * @param formData - FormData containing the file and metadata
 */
export async function uploadSurveyMediaAction(
  formData: FormData,
): Promise<ActionResult<{ mediaId: string; media: SurveyMedia }>> {
  try {
    const session = await getVerifiedSession();

    const surveyId = formData.get("surveyId") as string;
    const description = formData.get("description") as string;
    const contextForUse = formData.get("contextForUse") as string;

    const type =
      (formData.get("type") as "image" | "audio" | "video") || "image"; // Default to image if not specified
    const durationMs = Number(formData.get("durationMs"));
    const file = formData.get("file") as File;

    const validation = uploadSurveyMediaSchema.parse({
      surveyId,
      description,
      contextForUse,

      type,
      durationMs:
        isNaN(durationMs) || durationMs === 0 ? undefined : durationMs,
    });

    if (!file || !(file instanceof File)) {
      return { success: false, error: "No file provided" };
    }

    const imageTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    const audioTypes = [
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/webm",
      "audio/mp4",
    ];
    const videoTypes = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/ogg",
    ];

    let validTypes = imageTypes;
    if (type === "audio") validTypes = audioTypes;
    if (type === "video") validTypes = videoTypes;

    if (!validTypes.includes(file.type)) {
      return {
        success: false,
        error: `Invalid file type for ${type}.`,
      };
    }

    const maxSizeMB = type === "image" ? 5 : 100;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return {
        success: false,
        error: `File size exceeds ${maxSizeMB}MB limit`,
      };
    }

    const [survey] = await getDb()
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
        error: "Cannot upload media to survey in current status",
      };
    }

    const mediaId = nanoid();

    const arrayBuffer = await file.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    // SERVER-SIDE VERIFICATION: Verify file type using magic bytes
    const fileType = await fileTypeFromBuffer(buffer as any);
    if (!fileType) {
      return { success: false, error: "Could not determine file type" };
    }

    // Ensure the detected type matches the expected category
    const isImage = fileType.mime.startsWith("image/");
    const isAudio = fileType.mime.startsWith("audio/");
    const isVideo = fileType.mime.startsWith("video/");

    if (
      (type === "image" && !isImage) ||
      (type === "audio" && !isAudio) ||
      (type === "video" && !isVideo)
    ) {
      return {
        success: false,
        error: `File content does not match expected ${type} type`,
      };
    }

    // Double check specific allowed mimetypes (from byte verification)
    if (!validTypes.includes(fileType.mime)) {
      return { success: false, error: "Unsupported file content" };
    }

    // IMAGE HARDENING: Strip metadata/EXIF and normalize
    if (type === "image") {
      try {
        buffer = (await sharp(buffer as any)
          .rotate() // Auto-rotate based on EXIF before stripping
          .toBuffer()) as any; // metadata is stripped by default in toBuffer unless specifically kept
      } catch (sharpError) {
        console.error("[Media Upload] Sharp processing failed:", sharpError);
        return { success: false, error: "Failed to process image safely" };
      }
    }

    // Determines bucket internally in storage.ts based on 'type'
    const { url } = await uploadSurveyMedia(
      buffer,
      validation.surveyId,
      mediaId,
      fileType.mime, // Use verified mime type
      type,
    );

    const newMedia: SurveyMedia = {
      id: mediaId,
      url,
      type: type,
      description: validation.description,
      contextForUse: validation.contextForUse,

      durationMs: validation.durationMs || null,
      mimeType: fileType.mime, // Use verified mime type
    };

    const updatedMedia = [...(survey.media || []), newMedia];

    await getDb()
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
 * Update media metadata (audio/video/image)
 */
export async function updateSurveyMediaAction(
  input: z.infer<typeof updateSurveyMediaSchema>,
): Promise<ActionResult<{ media: SurveyMedia }>> {
  try {
    const session = await getVerifiedSession();
    const body = updateSurveyMediaSchema.parse(input);

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));
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
      body.durationMs !== undefined
        ? Math.min(body.durationMs, 5 * 60 * 1000)
        : undefined;

    const updatedMedia: SurveyMedia = {
      ...currentMedia[mediaIndex],
      ...(body.url && { url: body.url }),
      ...(body.description && { description: body.description }),

      ...(durationMsUpdate !== undefined && { durationMs: durationMsUpdate }),
      ...(body.mimeType && { mimeType: body.mimeType }),
    };

    const newMediaArray = [...currentMedia];
    newMediaArray[mediaIndex] = updatedMedia;

    await getDb()
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
 * Remove media from a survey
 */
export async function removeSurveyMediaAction(
  input: z.infer<typeof removeSurveyMediaSchema>,
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const session = await getVerifiedSession();
    const body = removeSurveyMediaSchema.parse(input);

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));
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

    // Delete from storage
    try {
      const pathSegment = mediaToRemove.url.split(
        "/storage/v1/object/public/",
      )[1];
      if (pathSegment) {
        // Auto-detect bucket from path or use type if path structure is standard
        // deleteSurveyAsset handles it if we pass kind.
        // We can infer kind from mediaToRemove.type
        // Or if we need to parse bucket from path:
        let bucketPrefix = "";
        let kind: "image" | "audio" | "video" = "image";

        if (mediaToRemove.type === "audio") {
          bucketPrefix = "survey-audio/";
          kind = "audio";
        } else if (mediaToRemove.type === "video") {
          bucketPrefix = "survey-video/";
          kind = "video";
        } else {
          bucketPrefix = "survey-images/";
          kind = "image";
        }

        if (pathSegment.startsWith(bucketPrefix)) {
          const storagePath = pathSegment.replace(bucketPrefix, "");
          await deleteSurveyMedia(storagePath, kind);
        }
      }
    } catch (storageError) {
      console.error("Failed to delete media from storage:", storageError);
    }

    const updatedMedia = currentMedia.filter((m) => m.id !== body.mediaId);

    await getDb()
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
 * Add a media item URL to a survey (external reference)
 * @deprecated Use uploadSurveyMediaAction for uploading files
 */
export async function addSurveyMediaAction(
  input: z.infer<typeof addSurveyMediaSchema>,
): Promise<ActionResult<{ mediaId: string; media: SurveyMedia }>> {
  try {
    const session = await getVerifiedSession();
    const body = addSurveyMediaSchema.parse(input);

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

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
        error: "Cannot add media to survey in current status",
      };
    }

    const mediaId = nanoid();
    const newMedia: SurveyMedia = {
      id: mediaId,
      url: body.url,
      type: body.type,
      description: body.description,
      contextForUse: body.contextForUse,

      durationMs: body.durationMs || null,
    };

    const updatedMedia = [...(survey.media || []), newMedia];

    await getDb()
      .update(surveys)
      .set({ media: updatedMedia })
      .where(eq(surveys.id, body.surveyId));

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
    return { success: false, error: "Failed to add media" };
  }
}

/**
 * Get all media for a survey
 */
export async function getSurveyMediaAction(
  surveyId: string,
): Promise<ActionResult<{ media: SurveyMedia[] }>> {
  try {
    const session = await getVerifiedSession();

    // Get survey and verify ownership
    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    const media = survey.media || [];
    return {
      success: true,
      data: { media },
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
    return { success: false, error: "Failed to get media" };
  }
}

/**
 * Reorder media in a survey
 */
export async function reorderSurveyMediaAction(
  surveyId: string,
  mediaIds: string[],
): Promise<ActionResult<{ media: SurveyMedia[] }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

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
        error: "Cannot reorder media in survey with current status",
      };
    }

    // Create a map of current media for easy lookup
    const currentMedia = survey.media || [];
    const mediaMap = new Map(currentMedia.map((m) => [m.id, m]));

    // Build new array based on input IDs, preserving verified media
    const reorderedMedia = mediaIds
      .map((id) => mediaMap.get(id))
      .filter((m): m is SurveyMedia => m !== undefined);

    if (reorderedMedia.length !== currentMedia.length) {
      return { success: false, error: "Invalid media IDs provided" };
    }

    await getDb()
      .update(surveys)
      .set({ media: reorderedMedia })
      .where(eq(surveys.id, surveyId));

    return {
      success: true,
      data: { media: reorderedMedia },
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
    return { success: false, error: "Failed to reorder media" };
  }
}
