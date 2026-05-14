/**
 * Centralized validation schemas for survey-related operations
 * Using Zod for runtime type safety and validation
 */

import { z } from "zod";
import { appLocales } from "@/lib/i18n/config";

/**
 * Schema for creating a new survey
 */
export const createSurveySchema = z.object({
  deliveryMode: z.enum(["link", "classroom_assigned"]).default("link"),
  classroomId: z
    .string()
    .min(1, "Classroom ID cannot be empty")
    .max(100, "Classroom ID too long")
    .optional()
    .nullable()
    .transform((val) => (val && val.trim().length > 0 ? val.trim() : null)),
  language: z.enum(appLocales).optional().nullable(),
  isVoice: z.boolean().default(false),
});

export type CreateSurveyInput = z.infer<typeof createSurveySchema>;

/**
 * Schema for updating survey settings
 */
export const updateSurveySchema = z.object({
  id: z.string().min(1, "Survey ID is required"),
  title: z
    .string()
    .min(1, "Title cannot be empty")
    .max(200, "Title too long")
    .optional(),
  participantLimit: z
    .number()
    .int("Participant limit must be an integer")
    .positive("Participant limit must be positive")
    .max(50, "Maximum participant limit is 50")
    .optional(),
  language: z.enum(appLocales).optional(),
  isVoice: z.boolean().optional(),
});

export type UpdateSurveyInput = z.infer<typeof updateSurveySchema>;

/**
 * Schema for survey custom slug
 */
export const surveyCustomSlugSchema = z.object({
  surveyId: z.string().min(1, "Survey ID is required"),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(64, "Slug must be at most 64 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    )
    .refine(
      (val) => !val.startsWith("-") && !val.endsWith("-"),
      "Slug cannot start or end with a hyphen"
    )
    .refine(
      (val) => !val.includes("--"),
      "Slug cannot contain consecutive hyphens"
    ),
});

export type SurveyCustomSlugInput = z.infer<typeof surveyCustomSlugSchema>;

/**
 * Schema for survey ID parameter
 */
export const surveyIdSchema = z.string().min(1, "Survey ID is required");

