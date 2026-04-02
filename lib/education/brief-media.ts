import { z } from "zod";

export const surveyMediaSchema = z.object({
  id: z.string(),
  url: z.string(),
  type: z.enum(["image", "audio", "video"]),
  description: z.string(),
  contextForUse: z.string(),

  durationMs: z.number().int().nonnegative().nullable().optional(),
  mimeType: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  requiredQuestions: z.array(z.string()).default([]),
  expectedInsights: z.array(z.enum(["emotional", "behavioral", "rational"])).default([]),
  altText: z.string().optional(),
  thumbnailUrl: z.string().optional(),
});

export type SurveyMedia = z.infer<typeof surveyMediaSchema>;
