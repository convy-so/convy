import { z } from "zod";

export const feedbackDimensionSchema = z.enum([
  "tone",
  "warmth",
  "professionalism",
  "clarity",
  "question_length",
  "probe_depth",
  "pace",
  "opening_style",
  "closing_style",
  "topic_coverage",
  "topic_order",
  "realism",
  "participant_comfort",
]);

export const feedbackIssueSchema = z.enum([
  "too_formal",
  "too_robotic",
  "too_long",
  "compound_questions",
  "weak_probing",
  "over_probing",
  "missed_topic",
  "felt_unrealistic",
  "too_blunt",
  "too_vague",
  "not_student_friendly",
  "not_professional_enough",
]);

export const feedbackImpactLevelSchema = z.enum([
  "minor_phrase",
  "behavior_change",
  "research_change",
]);

export const sampleFeedbackEntryInputSchema = z.object({
  conversationNumber: z.number().int().positive(),
  selectedIssues: z.array(feedbackIssueSchema).default([]),
  selectedDimensions: z.array(feedbackDimensionSchema).default([]),
  desiredChange: z.string().default(""),
  exampleQuestion: z.string().default(""),
  freeText: z.string().default(""),
  impactLevel: feedbackImpactLevelSchema.default("behavior_change"),
});

export type FeedbackDimension = z.infer<typeof feedbackDimensionSchema>;
export type FeedbackIssue = z.infer<typeof feedbackIssueSchema>;
export type FeedbackImpactLevel = z.infer<typeof feedbackImpactLevelSchema>;
export type SampleFeedbackEntryInput = z.infer<typeof sampleFeedbackEntryInputSchema>;

export const sampleRequestedChangeSchema = z.object({
  dimension: feedbackDimensionSchema,
  instruction: z.string(),
  strength: z.enum(["light", "moderate", "strong"]).default("moderate"),
  rationale: z.string(),
});

export type SampleRequestedChange = z.infer<typeof sampleRequestedChangeSchema>;

export const briefPatchSchema = z.object({
  addRequiredTopics: z.array(z.string()).default([]),
  note: z.string().default(""),
});

export type BriefPatch = z.infer<typeof briefPatchSchema>;

export const sampleFeedbackPatchSchema = z.object({
  classification: z.enum(["style", "design", "mixed", "invalid"]),
  confidence: z.number().min(0).max(1),
  requiresClarification: z.boolean().default(false),
  clarificationQuestion: z.string().optional(),
  blockedReasons: z.array(z.string()).default([]),
  requestedChanges: z.array(sampleRequestedChangeSchema).default([]),
  approvedChanges: z.array(sampleRequestedChangeSchema).default([]),
  rejectedChanges: z.array(sampleRequestedChangeSchema).default([]),
  briefPatch: briefPatchSchema.nullable().default(null),
  status: z.enum(["approved", "partially_approved", "clarification_needed", "rejected"]),
  summary: z.string(),
});

export type SampleFeedbackPatch = z.infer<typeof sampleFeedbackPatchSchema>;

export const sampleConductingProfileSchema = z.object({
  version: z.number().int().positive(),
  mode: z.enum(["sample", "live"]),
  sourcePatchId: z.string(),
  summary: z.string(),
  toneDirectives: z.array(z.string()).default([]),
  questionDirectives: z.array(z.string()).default([]),
  probeDirectives: z.array(z.string()).default([]),
  openingDirectives: z.array(z.string()).default([]),
  closingDirectives: z.array(z.string()).default([]),
  coverageDirectives: z.array(z.string()).default([]),
  blockedNotes: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export type SampleConductingProfile = z.infer<typeof sampleConductingProfileSchema>;
