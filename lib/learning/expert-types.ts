import { z } from "zod";

export const pedagogyAssetKindSchema = z.enum([
  "subject_playbook",
  "misconception_rule",
  "question_pattern",
  "rubric_set",
  "hint_ladder",
  "reflection_template",
]);

export const pedagogyAssetStatusSchema = z.enum([
  "draft",
  "approved",
  "archived",
]);

export const reviewQueueStatusSchema = z.enum([
  "pending",
  "reviewed",
  "published",
]);

export const expertAnnotationSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable().default(null),
  topicId: z.string().nullable().default(null),
  classroomStudentId: z.string().nullable().default(null),
  sessionId: z.string().nullable().default(null),
  interactionId: z.string().nullable().default(null),
  subjectKey: z.string().nullable().default(null),
  curriculumFrameworkKey: z.string().default("kmk_de_sek1"),
  annotationType: z.enum([
    "misconception",
    "reasoning_strength",
    "reasoning_gap",
    "question_quality",
    "rubric_improvement",
    "hint_ladder",
  ]),
  status: reviewQueueStatusSchema.default("pending"),
  summary: z.string(),
  evidence: z.string().default(""),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ExpertAnnotation = z.infer<typeof expertAnnotationSchema>;

export const pedagogyAssetVersionSchema = z.object({
  id: z.string(),
  packId: z.string(),
  version: z.number().int().positive(),
  status: pedagogyAssetStatusSchema,
  artifact: z.record(z.string(), z.unknown()),
  notes: z.string().nullable().default(null),
  createdByUserId: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PedagogyAssetVersion = z.infer<typeof pedagogyAssetVersionSchema>;

export const pedagogyAssetSchema = z.object({
  id: z.string(),
  feature: z.string(),
  artifactType: pedagogyAssetKindSchema,
  status: pedagogyAssetStatusSchema,
  name: z.string(),
  description: z.string().nullable().default(null),
  targetScope: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  activeVersionId: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
  versions: z.array(pedagogyAssetVersionSchema).default([]),
});

export type PedagogyAsset = z.infer<typeof pedagogyAssetSchema>;

export const reviewQueueItemSchema = z.object({
  key: z.string(),
  sessionId: z.string().nullable().default(null),
  topicId: z.string().nullable().default(null),
  classroomStudentId: z.string().nullable().default(null),
  studentName: z.string().nullable().default(null),
  topicTitle: z.string().nullable().default(null),
  subjectKey: z.string().nullable().default(null),
  subjectLabel: z.string().nullable().default(null),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  reasons: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;
