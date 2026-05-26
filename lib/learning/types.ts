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
  masteryThreshold: z.number().min(0).max(100).default(0),
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

export const groundingCitationSchema = z.object({
  materialId: z.string().default(""),
  segmentId: z.string().default(""),
  pageStart: z.number().int().positive().nullable().default(null),
  pageEnd: z.number().int().positive().nullable().default(null),
  headingPath: z.array(z.string()).default([]),
  snippet: z.string().default(""),
});

export type GroundingCitation = z.infer<typeof groundingCitationSchema>;

export const materialSourceSegmentSchema = z.object({
  segmentId: z.string().min(1),
  order: z.number().int().nonnegative(),
  pageStart: z.number().int().positive().nullable().default(null),
  pageEnd: z.number().int().positive().nullable().default(null),
  headingPath: z.array(z.string()).default([]),
  text: z.string().default(""),
  charCount: z.number().int().nonnegative().default(0),
});

export type MaterialSourceSegment = z.infer<typeof materialSourceSegmentSchema>;

export const materialSourceDocumentSchema = z.object({
  materialId: z.string().default(""),
  sourceTitle: z.string().default(""),
  mimeType: z.string().default(""),
  extractor: z.string().default(""),
  sourceHash: z.string().default(""),
  extractedText: z.string().default(""),
  qualityFlags: z.array(z.string()).default([]),
  truncated: z.boolean().default(false),
  segments: z.array(materialSourceSegmentSchema).default([]),
});

export type MaterialSourceDocument = z.infer<typeof materialSourceDocumentSchema>;

export const materialGroundingConceptSchema = z.object({
  name: z.string().min(1),
  summary: z.string().default(""),
  citations: z.array(groundingCitationSchema).default([]),
});

export type MaterialGroundingConcept = z.infer<
  typeof materialGroundingConceptSchema
>;

export const materialGroundingDefinitionSchema = z.object({
  term: z.string().min(1),
  definition: z.string().default(""),
  citations: z.array(groundingCitationSchema).default([]),
});

export type MaterialGroundingDefinition = z.infer<
  typeof materialGroundingDefinitionSchema
>;

export const materialGroundingProcedureSchema = z.object({
  name: z.string().min(1),
  summary: z.string().default(""),
  steps: z.array(z.string()).default([]),
  citations: z.array(groundingCitationSchema).default([]),
});

export type MaterialGroundingProcedure = z.infer<
  typeof materialGroundingProcedureSchema
>;

export const materialGroundingFormulaSchema = z.object({
  label: z.string().min(1),
  expression: z.string().min(1),
  conditions: z.string().default(""),
  usageNotes: z.string().default(""),
  citations: z.array(groundingCitationSchema).default([]),
});

export type MaterialGroundingFormula = z.infer<
  typeof materialGroundingFormulaSchema
>;

export const materialGroundingSegmentSchema = z.object({
  segmentId: z.string().min(1),
  order: z.number().int().nonnegative(),
  pageStart: z.number().int().positive().nullable().default(null),
  pageEnd: z.number().int().positive().nullable().default(null),
  headingPath: z.array(z.string()).default([]),
  concepts: z.array(materialGroundingConceptSchema).default([]),
  definitions: z.array(materialGroundingDefinitionSchema).default([]),
  procedures: z.array(materialGroundingProcedureSchema).default([]),
  formulas: z.array(materialGroundingFormulaSchema).default([]),
  workedExamples: z.array(z.string()).default([]),
  notationRules: z.array(z.string()).default([]),
  rigorSignals: z.array(z.string()).default([]),
  scopeInclusions: z.array(z.string()).default([]),
  scopeExclusions: z.array(z.string()).default([]),
  ambiguities: z.array(z.string()).default([]),
});

export type MaterialGroundingSegment = z.infer<
  typeof materialGroundingSegmentSchema
>;

export const materialGroundingMapSchema = z.object({
  version: z.number().int().positive().default(1),
  builtAt: z.string().min(1),
  sourceHash: z.string().default(""),
  materialId: z.string().default(""),
  sourceTitle: z.string().default(""),
  overview: z.string().default(""),
  sections: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      summary: z.string().default(""),
      keyPoints: z.array(z.string()).default([]),
      citations: z.array(groundingCitationSchema).default([]),
    }),
  ).default([]),
  concepts: z.array(materialGroundingConceptSchema).default([]),
  definitions: z.array(materialGroundingDefinitionSchema).default([]),
  procedures: z.array(materialGroundingProcedureSchema).default([]),
  formulas: z.array(materialGroundingFormulaSchema).default([]),
  notationRules: z.array(z.string()).default([]),
  rigorRules: z.array(z.string()).default([]),
  scopeRules: z.array(z.string()).default([]),
  explicitlyOutOfScope: z.array(z.string()).default([]),
  teachingNotes: z.array(z.string()).default([]),
  ambiguities: z.array(z.string()).default([]),
  segmentGroundings: z.array(materialGroundingSegmentSchema).default([]),
});

export type MaterialGroundingMap = z.infer<typeof materialGroundingMapSchema>;

export const materialCoverageReviewSchema = z.object({
  summary: z.string().default(""),
  groundingSummary: z.string().default(""),
  supportedOutcomes: z.array(z.string()).default([]),
  partialOutcomes: z.array(z.string()).default([]),
  unsupportedOutcomes: z.array(z.string()).default([]),
  clarifyingQuestions: z.array(z.string()).default([]),
  coverageObservations: z.array(z.string()).default([]),
  recommendedOutcomeEdits: z.array(z.string()).default([]),
  rigorNotes: z.array(z.string()).default([]),
  notationNotes: z.array(z.string()).default([]),
  scopeNotes: z.array(z.string()).default([]),
});

export type MaterialCoverageReview = z.infer<
  typeof materialCoverageReviewSchema
>;

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

export const expertFrameworkSchema = z.object({
  name: z.string().trim().min(1, "Framework name is required"),
  description: z.string().default(""),
  toolUsageGuidance: z.string().default(""),
  fewShotExamples: z
    .array(z.union([z.string(), legacyExpertFrameworkExampleSchema]))
    .default([])
    .transform((items) =>
      items
        .map(coerceFrameworkExampleToText)
        .filter((item): item is string => item !== null),
    ),
  markdownContent: z.string().default(""),
  metadata: z.record(z.unknown()).default({}),
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
  relevanceScope: z.enum(["general", "framework_specific"]).default("general"),
});

export type ExpertHeuristic = z.infer<typeof expertHeuristicSchema>;

export const expertConflictPreviewSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  details: z.string().nullable().default(null),
});

export type ExpertConflictPreview = z.infer<
  typeof expertConflictPreviewSchema
>;

export const activeExpertFrameworkSchema = z.object({
  frameworkId: z.string().min(1),
  frameworkVersionId: z.string().min(1),
  framework: expertFrameworkSchema,
  heuristics: z.array(expertHeuristicSchema).default([]),
  openConflicts: z.array(expertConflictPreviewSchema).default([]),
  seedSource: z.enum(["deep_default", "expert_authored"]).default("deep_default"),
});

export type ActiveExpertFramework = z.infer<
  typeof activeExpertFrameworkSchema
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

export const topicGroundingFormulaSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  expression: z.string().min(1),
  conditions: z.string().default(""),
  usageNotes: z.string().default(""),
  citations: z.array(groundingCitationSchema).default([]),
});

export type TopicGroundingFormula = z.infer<typeof topicGroundingFormulaSchema>;

export const topicGroundingSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().default(""),
  keyPoints: z.array(z.string()).default([]),
  citations: z.array(groundingCitationSchema).default([]),
});

export type TopicGroundingSection = z.infer<typeof topicGroundingSectionSchema>;

export const topicGroundingConceptSchema = z.object({
  name: z.string().min(1),
  summary: z.string().default(""),
  citations: z.array(groundingCitationSchema).default([]),
});

export const topicGroundingPackSchema = z.object({
  version: z.number().int().positive(),
  builtAt: z.string().min(1),
  materialIds: z.array(z.string()).default([]),
  topicTitle: z.string().default(""),
  digest: z.string().default(""),
  inScopeConcepts: z.array(topicGroundingConceptSchema).default([]),
  explicitlyOutOfScope: z.array(z.string()).default([]),
  formulas: z.array(topicGroundingFormulaSchema).default([]),
  sections: z.array(topicGroundingSectionSchema).default([]),
  notationRules: z.array(z.string()).default([]),
  rigorRules: z.array(z.string()).default([]),
  scopeRules: z.array(z.string()).default([]),
  teachingNotes: z.array(z.string()).default([]),
  conflictNotes: z.array(z.string()).default([]),
  sourceSummaries: z.array(
    z.object({
      materialId: z.string().default(""),
      title: z.string().default(""),
      overview: z.string().default(""),
    }),
  ).default([]),
});

export type TopicGroundingPack = z.infer<typeof topicGroundingPackSchema>;

export const contentScopeSnapshotSchema = z.object({
  topicId: z.string().nullable().default(null),
  topicTitle: z.string().default(""),
  contentLocale: z.string().default("en"),
  teacherSummary: z.string().default(""),
  materialIds: z.array(z.string()).default([]),
  scopeNotes: z.array(z.string()).default([]),
  notationNotes: z.array(z.string()).default([]),
  rigorNotes: z.array(z.string()).default([]),
  /** Legacy field; populated from the topic pack section summaries for compatibility. */
  retrievedContext: z.array(z.string()).default([]),
  learningOutcomes: z.array(learningOutcomeDefinitionSchema).optional().default([]),
  groundingPackVersion: z.number().int().nonnegative().default(0),
  topicGroundingPack: topicGroundingPackSchema.nullable().default(null),
});

export type ContentScopeSnapshot = z.infer<typeof contentScopeSnapshotSchema>;

export const learningSessionStateSchema = z.object({
  topicId: z.string().nullable().default(null),
  topicTitle: z.string().default(""),
  frameworkVersionId: z.string().nullable().default(null),
  groundingPackVersion: z.number().int().nonnegative().default(0),
  contentScopeSnapshot: contentScopeSnapshotSchema.nullable().default(null),
  recentMessageSummary: z.string().default(""),
  recentEvidence: z.array(z.string()).default([]),
  tutorNotes: z.array(z.string()).default([]),
  turnCount: z.number().int().nonnegative().default(0),
  reportReady: z.boolean().default(false),
  completed: z.boolean().default(false),
  completionRequestedAt: z.string().nullable().default(null),
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
  frameworkPhase: z.string().default(""),
  frameworkLevel: z.string().default(""),
  frameworkProgressSummary: z.string().default(""),
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
