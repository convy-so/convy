import { z } from "zod";

import {
  IMAGE_SEARCH_MAX_CALLS_PER_TURN,
  TUTOR_CAPABILITY_IDS,
  VIDEO_SEARCH_MAX_CALLS_PER_TURN,
} from "@/features/tutoring/server/tutor-capabilities";
import {
  EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES,
  TUTORING_STATUS,
} from "@/shared/tutoring/constants";

const capabilityPolicySchema = z.string().default("").transform((value) => value.trim());

export const searchImageCapabilityConfigSchema = z.object({
  enabled: z.boolean().default(false),
  policy: capabilityPolicySchema,
  maxUsesPerTurn: z.number().int().min(1).max(IMAGE_SEARCH_MAX_CALLS_PER_TURN).default(1),
}).strict();

export const searchVideoCapabilityConfigSchema = z.object({
  enabled: z.boolean().default(false),
  policy: capabilityPolicySchema,
  maxUsesPerTurn: z.number().int().min(1).max(VIDEO_SEARCH_MAX_CALLS_PER_TURN).default(1),
}).strict();

export const administerQuizCapabilityConfigSchema = z.object({
  enabled: z.boolean().default(false),
  policy: capabilityPolicySchema,
}).strict();

export const gradeStudentWorkCapabilityConfigSchema = z.object({
  enabled: z.boolean().default(false),
  policy: capabilityPolicySchema,
}).strict();

export const finishSessionCapabilityConfigSchema = z.object({
  policy: capabilityPolicySchema,
}).strict();

export const expertFrameworkCapabilityGuidanceSchema = z.object({
  search_image: searchImageCapabilityConfigSchema.default({
    enabled: false,
    policy: "",
    maxUsesPerTurn: 1,
  }),
  search_video: searchVideoCapabilityConfigSchema.default({
    enabled: false,
    policy: "",
    maxUsesPerTurn: 1,
  }),
  administer_quiz: administerQuizCapabilityConfigSchema.default({
    enabled: false,
    policy: "",
  }),
  grade_student_work: gradeStudentWorkCapabilityConfigSchema.default({
    enabled: false,
    policy: "",
  }),
  finish_session: finishSessionCapabilityConfigSchema.default({
    policy: "",
  }),
}).strict();

export type SearchImageCapabilityConfig = z.infer<typeof searchImageCapabilityConfigSchema>;
export type SearchVideoCapabilityConfig = z.infer<typeof searchVideoCapabilityConfigSchema>;
export type AdministerQuizCapabilityConfig = z.infer<typeof administerQuizCapabilityConfigSchema>;
export type GradeStudentWorkCapabilityConfig = z.infer<typeof gradeStudentWorkCapabilityConfigSchema>;
export type FinishSessionCapabilityConfig = z.infer<typeof finishSessionCapabilityConfigSchema>;
export type ExpertFrameworkCapabilityGuidance = z.infer<
  typeof expertFrameworkCapabilityGuidanceSchema
>;

export function isTutorCapabilityEnabled(
  guidance: ExpertFrameworkCapabilityGuidance,
  capabilityId: (typeof TUTOR_CAPABILITY_IDS)[number],
) {
  if (capabilityId === "finish_session") {
    return true;
  }

  return guidance[capabilityId].enabled;
}

export function getTutorCapabilityPolicy(
  guidance: ExpertFrameworkCapabilityGuidance,
  capabilityId: (typeof TUTOR_CAPABILITY_IDS)[number],
) {
  return guidance[capabilityId].policy.trim();
}

export function getTutorCapabilityMaxUsesPerTurn(
  guidance: ExpertFrameworkCapabilityGuidance,
  capabilityId: "search_image" | "search_video",
) {
  return guidance[capabilityId].maxUsesPerTurn;
}

export const expertFrameworkSchema = z.object({
  name: z.string().trim().min(1, "Framework name is required"),
  description: z.string().default(""),
  capabilityGuidance: z.preprocess(
    (value) => value ?? {},
    expertFrameworkCapabilityGuidanceSchema,
  ),
  fewShotExamples: z.array(z.string()).default([]),
  markdownContent: z.string().default(""),
});
export type ExpertFramework = z.infer<typeof expertFrameworkSchema>;

export const expertHeuristicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  trigger: z.string().min(1),
  action: z.string().min(1),
  rationale: z.string().default(""),
  examples: z.array(z.string()).default([]),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  tags: z.array(z.string()).default([]),
  relevanceScope: z
    .enum(EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES)
    .default(TUTORING_STATUS.relevanceGeneral),
});
export type ExpertHeuristic = z.infer<typeof expertHeuristicSchema>;

export const expertConflictPreviewSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  details: z.string().nullable().default(null),
});
export type ExpertConflictPreview = z.infer<typeof expertConflictPreviewSchema>;

export const activeExpertGuidanceBundleSchema = z.object({
  frameworkId: z.string().min(1),
  framework: expertFrameworkSchema,
  heuristics: z.array(expertHeuristicSchema).default([]),
  openConflicts: z.array(expertConflictPreviewSchema).default([]),
});
export type ActiveExpertGuidanceBundle = z.infer<
  typeof activeExpertGuidanceBundleSchema
>;

