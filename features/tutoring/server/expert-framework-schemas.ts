import { z } from "zod";

import {
  IMAGE_SEARCH_MAX_CALLS_PER_TURN,
  TOGGLEABLE_TUTOR_CAPABILITY_IDS,
  TUTOR_CAPABILITY_IDS,
  VIDEO_SEARCH_MAX_CALLS_PER_TURN,
} from "@/features/tutoring/server/tutor-capabilities";
import {
  EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES,
  LEARNING_STATUS,
} from "@/shared/learning/constants";

const legacyExpertFrameworkExampleSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  focusArea: z.string().optional(),
  studentMessage: z.string().optional(),
  tutorResponse: z.string().optional(),
  rationale: z.string().optional(),
});

function coerceFrameworkExampleToText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  const parsed = legacyExpertFrameworkExampleSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const example = parsed.data;
  const parts = [
    example.title?.trim(),
    example.focusArea?.trim() ? `Focus: ${example.focusArea.trim()}` : null,
    example.studentMessage?.trim() ? `Student: ${example.studentMessage.trim()}` : null,
    example.tutorResponse?.trim() ? `Tutor: ${example.tutorResponse.trim()}` : null,
    example.rationale?.trim() ? `Why: ${example.rationale.trim()}` : null,
  ].filter((part): part is string => Boolean(part));

  const text = parts.join("\n\n").trim();
  return text.length > 0 ? text : null;
}

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

export function createEmptyExpertFrameworkCapabilityGuidance(): ExpertFrameworkCapabilityGuidance {
  return expertFrameworkCapabilityGuidanceSchema.parse({});
}

export function isLegacyExpertFrameworkCapabilityGuidance(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  let foundLegacyValue = false;
  for (const capabilityId of TUTOR_CAPABILITY_IDS) {
    const entry = (value as Record<string, unknown>)[capabilityId];
    if (entry === undefined) {
      continue;
    }
    if (typeof entry !== "string") {
      return false;
    }
    foundLegacyValue = true;
  }

  return foundLegacyValue;
}

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
  fewShotExamples: z
    .array(z.union([z.string(), legacyExpertFrameworkExampleSchema]))
    .default([])
    .transform((items) =>
      items.map(coerceFrameworkExampleToText).filter((item): item is string => item !== null),
    ),
  markdownContent: z.string().default(""),
  metadata: z.record(z.unknown()).default({}),
});
export type ExpertFramework = z.infer<typeof expertFrameworkSchema>;

export function getIncompleteExpertFrameworkCapabilityIds(
  framework: Pick<ExpertFramework, "capabilityGuidance">,
) {
  const missingPolicies: (typeof TUTOR_CAPABILITY_IDS)[number][] = [];

  for (const capabilityId of TOGGLEABLE_TUTOR_CAPABILITY_IDS) {
    const capability = framework.capabilityGuidance[capabilityId];
    if (capability.enabled && !capability.policy.trim()) {
      missingPolicies.push(capabilityId);
    }
  }

  if (!framework.capabilityGuidance.finish_session.policy.trim()) {
    missingPolicies.push("finish_session");
  }

  return missingPolicies;
}

export function hasCompleteExpertFrameworkCapabilityGuidance(
  framework: Pick<ExpertFramework, "capabilityGuidance">,
) {
  return getIncompleteExpertFrameworkCapabilityIds(framework).length === 0;
}

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
    .default(LEARNING_STATUS.relevanceGeneral),
});
export type ExpertHeuristic = z.infer<typeof expertHeuristicSchema>;

export const expertConflictPreviewSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  details: z.string().nullable().default(null),
});
export type ExpertConflictPreview = z.infer<typeof expertConflictPreviewSchema>;

export const activeExpertFrameworkSchema = z.object({
  frameworkId: z.string().min(1),
  framework: expertFrameworkSchema,
  heuristics: z.array(expertHeuristicSchema).default([]),
  openConflicts: z.array(expertConflictPreviewSchema).default([]),
  seedSource: z.enum(["deep_default", "expert_authored"]).default("deep_default"),
});
export type ActiveExpertFramework = z.infer<typeof activeExpertFrameworkSchema>;
