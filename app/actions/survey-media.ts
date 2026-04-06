"use server";

import { z } from "zod";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const SURVEY_MEDIA_DISABLED_ERROR =
  "Survey media has been removed from creation, rehearsal, and respondent flows.";

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

export type SurveyMediaItem = {
  id: string;
  url: string;
  type: string;
  description?: string;
  contextForUse?: string;
};

export async function uploadSurveyMediaAction(
  formData: FormData,
): Promise<ActionResult<{ mediaId: string; media: SurveyMediaItem }>> {
  void uploadSurveyMediaSchema;
  void formData;
  return { success: false, error: SURVEY_MEDIA_DISABLED_ERROR };
}

export async function addSurveyMediaAction(
  input: z.infer<typeof addSurveyMediaSchema>,
): Promise<ActionResult<{ mediaId: string }>> {
  void input;
  return { success: false, error: SURVEY_MEDIA_DISABLED_ERROR };
}

export async function updateSurveyMediaAction(
  input: z.infer<typeof updateSurveyMediaSchema>,
): Promise<ActionResult<{ media: unknown }>> {
  void input;
  return { success: false, error: SURVEY_MEDIA_DISABLED_ERROR };
}

export async function removeSurveyMediaAction(
  input: z.infer<typeof removeSurveyMediaSchema>,
): Promise<ActionResult<{ success: boolean }>> {
  void input;
  return { success: false, error: SURVEY_MEDIA_DISABLED_ERROR };
}
