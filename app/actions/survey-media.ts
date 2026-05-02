"use server";

import { z } from "zod";
import { ActionResult } from "@/lib/action-wrapper";

const SURVEY_MEDIA_DISABLED_ERROR =
  "Survey media has been removed from creation, rehearsal, and respondent flows.";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained for z.infer action typing while survey media is disabled
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained for z.infer action typing while survey media is disabled
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained for z.infer action typing while survey media is disabled
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
  return { success: false, error: { code: "FORBIDDEN", message: SURVEY_MEDIA_DISABLED_ERROR } };
}

export async function addSurveyMediaAction(
  input: unknown,
): Promise<ActionResult<{ mediaId: string }>> {
  void input;
  return { success: false, error: { code: "FORBIDDEN", message: SURVEY_MEDIA_DISABLED_ERROR } };
}

export async function updateSurveyMediaAction(
  input: unknown,
): Promise<ActionResult<{ media: unknown }>> {
  void input;
  return { success: false, error: { code: "FORBIDDEN", message: SURVEY_MEDIA_DISABLED_ERROR } };
}

export async function removeSurveyMediaAction(
  input: unknown,
): Promise<ActionResult<{ success: boolean }>> {
  void input;
  return { success: false, error: { code: "FORBIDDEN", message: SURVEY_MEDIA_DISABLED_ERROR } };
}
