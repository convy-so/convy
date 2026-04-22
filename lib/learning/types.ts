import { z } from "zod";

export const gradeBandSchema = z.enum([
  "nursery",
  "primary",
  "secondary",
  "university",
]);

export type GradeBand = z.infer<typeof gradeBandSchema>;

export const motivationalStyleSchema = z.enum([
  "competition",
  "creativity",
  "helping_others",
  "financial_success",
  "recognition",
  "personal_mastery",
]);

export type MotivationalStyle = z.infer<typeof motivationalStyleSchema>;

export const learningRelationshipSchema = z.enum([
  "positive",
  "neutral",
  "damaged",
]);

export type LearningRelationship = z.infer<typeof learningRelationshipSchema>;

export const interestDetailSchema = z.object({
  label: z.string().min(1),
  details: z.string().min(1),
});

export type InterestDetail = z.infer<typeof interestDetailSchema>;

export const studentInterestProfileSchema = z.object({
  primaryInterests: z.array(interestDetailSchema).default([]),
  aspirations: z.array(z.string()).default([]),
  curiosityAreas: z.array(z.string()).default([]),
  motivationalStyle: z.array(motivationalStyleSchema).default([]),
  learningRelationship: learningRelationshipSchema.default("neutral"),
  contextTags: z.array(z.string()).default([]),
  privateNotes: z.array(z.string()).default([]),
  lastUpdated: z.string(),
});

export type StudentInterestProfile = z.infer<
  typeof studentInterestProfileSchema
>;

export const learningOutcomeDefinitionSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  evidenceSignals: z.array(z.string()).default([]),
  misconceptionTags: z.array(z.string()).default([]),
  masteryThreshold: z.number().min(0).max(100).default(70),
});

export type LearningOutcomeDefinition = z.infer<
  typeof learningOutcomeDefinitionSchema
>;

export const topicSourceBoundarySchema = z.object({
  teacherSummary: z.string().default(""),
  allowedMaterialIds: z.array(z.string()).default([]),
  rigorNotes: z.array(z.string()).default([]),
  notationNotes: z.array(z.string()).default([]),
  scopeNotes: z.array(z.string()).default([]),
  hallucinationPolicy: z
    .string()
    .default(
      "Stay inside the uploaded course material for concepts, notation, rigor, and problem scope. Use model intelligence only for pedagogy and framing.",
    ),
});

export type TopicSourceBoundary = z.infer<typeof topicSourceBoundarySchema>;

export const sessionOpeningStrategySchema = z.enum([
  "world_connection",
  "story",
  "provocation",
  "question",
]);

export type SessionOpeningStrategy = z.infer<
  typeof sessionOpeningStrategySchema
>;

export const sessionOpeningPlanSchema = z.object({
  strategy: sessionOpeningStrategySchema.default("world_connection"),
  personalizationFrame: z.string().default(""),
  bridgeConcept: z.string().default(""),
  invitationGoal: z.string().default(""),
  rationale: z.string().default(""),
});

export type SessionOpeningPlan = z.infer<typeof sessionOpeningPlanSchema>;

export const learningInteractionTypeSchema = z.enum([
  "onboarding_turn",
  "student_message",
  "tutor_message",
  "framework_transition",
  "student_model_signal",
  "out_of_session_question",
  "agent_answer",
  "session_event",
  "expert_review",
  "report_event",
]);

export type LearningInteractionType = z.infer<
  typeof learningInteractionTypeSchema
>;

export const questionIntentSchema = z.enum([
  "phase_response",
  "clarification",
  "curiosity",
  "off_topic",
]);

export type QuestionIntent = z.infer<typeof questionIntentSchema>;

export const sessionComparisonTrendSchema = z.enum([
  "improved",
  "steady",
  "regressed",
  "unknown",
]);

export type SessionComparisonTrend = z.infer<
  typeof sessionComparisonTrendSchema
>;

export const studentMasteryLevelSchema = z.enum([
  "surface",
  "applied",
  "generative",
]);

export type StudentMasteryLevel = z.infer<typeof studentMasteryLevelSchema>;

export const expertFrameworkStageSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  objective: z.string().min(1),
  exitCriteria: z.array(z.string()).default([]),
  guidance: z.array(z.string()).default([]),
  allowedNextStageIds: z.array(z.string()).default([]),
});

export type ExpertFrameworkStage = z.infer<typeof expertFrameworkStageSchema>;

export const expertFrameworkSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  startStageId: z.string().min(1),
  stages: z.array(expertFrameworkStageSchema).min(1),
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
});

export type ExpertHeuristic = z.infer<typeof expertHeuristicSchema>;

export const expertTutorRuntimeModelSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  frameworkVersionId: z.string().min(1),
  framework: expertFrameworkSchema,
  heuristics: z.array(expertHeuristicSchema).default([]),
  conflictIds: z.array(z.string()).default([]),
  seedSource: z.enum(["deep_default", "expert_authored"]).default("deep_default"),
});

export type ExpertTutorRuntimeModel = z.infer<
  typeof expertTutorRuntimeModelSchema
>;

export const motivationalContextSchema = z.object({
  surfaceInterests: z.array(z.string()).default([]),
  deeperMotivations: z.array(z.string()).default([]),
  aspirations: z.array(z.string()).default([]),
  culturalContext: z.array(z.string()).default([]),
  relevanceHooks: z.array(z.string()).default([]),
  careReasons: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

export type MotivationalContext = z.infer<typeof motivationalContextSchema>;

export const knowledgeStateNodeSchema = z.object({
  conceptKey: z.string().min(1),
  title: z.string().min(1),
  masteryLevel: studentMasteryLevelSchema.default("surface"),
  confidence: z.number().min(0).max(1).default(0.2),
  evidence: z.array(z.string()).default([]),
  misconceptions: z.array(z.string()).default([]),
  relatedKnownConcepts: z.array(z.string()).default([]),
  lastUpdatedAt: z.string(),
});

export type KnowledgeStateNode = z.infer<typeof knowledgeStateNodeSchema>;

export const cognitiveStyleCalibrationSchema = z.object({
  preferredEntryPoints: z.array(z.string()).default([]),
  stretchEntryPoints: z.array(z.string()).default([]),
  frictionPoints: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  summary: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.2),
});

export type CognitiveStyleCalibration = z.infer<
  typeof cognitiveStyleCalibrationSchema
>;

export const productiveStruggleCalibrationSchema = z.object({
  targetBand: z
    .enum(["high_support", "balanced", "high_challenge"])
    .default("balanced"),
  signals: z.array(z.string()).default([]),
  currentReadiness: z
    .enum(["fragile", "steady", "ready_for_more"])
    .default("steady"),
  recoverySupports: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

export type ProductiveStruggleCalibration = z.infer<
  typeof productiveStruggleCalibrationSchema
>;

export const longitudinalDevelopmentSchema = z.object({
  betterQuestionSignals: z.array(z.string()).default([]),
  transferSignals: z.array(z.string()).default([]),
  precisionSignals: z.array(z.string()).default([]),
  selfMonitoringSignals: z.array(z.string()).default([]),
  anomalies: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

export type LongitudinalDevelopment = z.infer<
  typeof longitudinalDevelopmentSchema
>;

export const studentModelSnapshotSchema = z.object({
  version: z.number().int().positive().default(1),
  motivationalContext: motivationalContextSchema.default({}),
  knowledgeStateModel: z.array(knowledgeStateNodeSchema).default([]),
  cognitiveStyleCalibration: cognitiveStyleCalibrationSchema.default({}),
  productiveStruggleCalibration:
    productiveStruggleCalibrationSchema.default({}),
  longitudinalDevelopment: longitudinalDevelopmentSchema.default({}),
  summary: z.string().default(""),
  updatedAt: z.string(),
});

export type StudentModelSnapshot = z.infer<typeof studentModelSnapshotSchema>;

export const frameworkStateSchema = z.object({
  currentStageId: z.string().nullable().default(null),
  completedStageIds: z.array(z.string()).default([]),
  stageAttemptCounts: z.record(z.string(), z.number().int().min(0)).default({}),
  stageStartedAt: z.record(z.string(), z.string()).default({}),
  stageCompletedAt: z.record(z.string(), z.string()).default({}),
  lastTransitionAt: z.string().nullable().default(null),
  lastTransitionReason: z.string().default(""),
});

export type FrameworkState = z.infer<typeof frameworkStateSchema>;

export const contentScopeSnapshotSchema = z.object({
  topicId: z.string().nullable().default(null),
  topicTitle: z.string().default(""),
  contentLocale: z.string().default("en"),
  teacherSummary: z.string().default(""),
  materialIds: z.array(z.string()).default([]),
  scopeNotes: z.array(z.string()).default([]),
  notationNotes: z.array(z.string()).default([]),
  rigorNotes: z.array(z.string()).default([]),
  retrievedContext: z.array(z.string()).default([]),
});

export type ContentScopeSnapshot = z.infer<typeof contentScopeSnapshotSchema>;

export const learningSessionStateSchema = z.object({
  topicTitle: z.string().default(""),
  runtimeModelId: z.string().nullable().default(null),
  runtimeModelVersion: z.number().int().positive().default(1),
  studentModelId: z.string().nullable().default(null),
  studentModelSnapshotId: z.string().nullable().default(null),
  frameworkState: frameworkStateSchema.default({}),
  contentScopeSnapshot: contentScopeSnapshotSchema.nullable().default(null),
  activeConceptKey: z.string().nullable().default(null),
  activeConceptTitle: z.string().nullable().default(null),
  knowledgeFocus: z.array(z.string()).default([]),
  misconceptionsObserved: z.array(z.string()).default([]),
  recentEvidence: z.array(z.string()).default([]),
  tutorNotes: z.array(z.string()).default([]),
  reportReady: z.boolean().default(false),
  completed: z.boolean().default(false),
});

export type LearningSessionState = z.infer<typeof learningSessionStateSchema>;

export const defaultLearningSessionState = learningSessionStateSchema.parse({});

export function createDefaultLearningSessionState(): LearningSessionState {
  return learningSessionStateSchema.parse({});
}

export const teacherProgressReportSchema = z.object({
  studentName: z.string(),
  topicTitle: z.string(),
  studentSummary: z.string(),
  pedagogicalSummary: z.string().default(""),
  conceptProgress: z
    .array(
      z.object({
        conceptKey: z.string(),
        title: z.string(),
        masteryLevel: studentMasteryLevelSchema,
        confidence: z.number().min(0).max(1).default(0),
        misconceptions: z.array(z.string()).default([]),
        evidence: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  motivationalHooksUsed: z.array(z.string()).default([]),
  productiveStruggleNotes: z.array(z.string()).default([]),
  longitudinalSignals: z.array(z.string()).default([]),
  recommendedTeacherActions: z.array(z.string()).default([]),
  homeworkAssigned: z.array(z.string()).default([]),
  studentConfidenceScore: z.number().int().min(1).max(10).nullable().default(null),
  expertReviewRecommended: z.boolean().default(false),
  expertReviewReason: z.string().default(""),
  identifiedGaps: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
  comparisonToPreviousSession: z.string().default(""),
  comparisonTrend: sessionComparisonTrendSchema.default("unknown"),
  transferReadiness: z
    .enum(["not_yet", "emerging", "ready"])
    .default("not_yet"),
  originalityWithinConstraint: z
    .enum(["low", "emerging", "strong"])
    .default("low"),
  recommendedInterventionType: z
    .enum(["reteach", "challenge", "practice", "confidence_check", "none"])
    .default("none"),
  metacognitiveMirror: z.string().default(""),
});

export type TeacherProgressReport = z.infer<typeof teacherProgressReportSchema>;

export const teacherOnboardingSummarySchema = z.object({
  summary: z.string(),
});

export type TeacherOnboardingSummary = z.infer<
  typeof teacherOnboardingSummarySchema
>;
