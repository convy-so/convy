import { z } from "zod";
import {
  GRADE_BAND_VALUES,
  LEARNING_INTERACTION_TYPE_VALUES,
  LEARNING_NUMERIC_DEFAULTS,
  LEARNING_RELATIONSHIP_VALUES,
  MOTIVATIONAL_STYLE_VALUES,
  PERCENTAGE_RANGE,
  QUESTION_INTENT_VALUES,
  SESSION_COMPARISON_TREND_VALUES,
  SESSION_OPENING_STRATEGY_VALUES,
  STUDENT_MASTERY_LEVEL_VALUES,
} from "@/shared/learning/constants";

export const gradeBandSchema = z.enum(GRADE_BAND_VALUES);
export type GradeBand = z.infer<typeof gradeBandSchema>;

export const motivationalStyleSchema = z.enum(MOTIVATIONAL_STYLE_VALUES);
export type MotivationalStyle = z.infer<typeof motivationalStyleSchema>;

export const learningRelationshipSchema = z.enum(LEARNING_RELATIONSHIP_VALUES);
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
  learningRelationship: learningRelationshipSchema.default(
    LEARNING_RELATIONSHIP_VALUES[1],
  ),
  contextTags: z.array(z.string()).default([]),
  privateNotes: z.array(z.string()).default([]),
  lastUpdated: z.string(),
});
export type StudentInterestProfile = z.infer<typeof studentInterestProfileSchema>;

export const learningOutcomeDefinitionSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  evidenceSignals: z.array(z.string()).default([]),
  misconceptionTags: z.array(z.string()).default([]),
  masteryThreshold: z
    .number()
    .min(PERCENTAGE_RANGE.min)
    .max(PERCENTAGE_RANGE.max)
    .default(PERCENTAGE_RANGE.defaultValue),
});
export type LearningOutcomeDefinition = z.infer<typeof learningOutcomeDefinitionSchema>;

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
  charCount: z
    .number()
    .int()
    .nonnegative()
    .default(LEARNING_NUMERIC_DEFAULTS.zero),
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
export type MaterialGroundingConcept = z.infer<typeof materialGroundingConceptSchema>;

export const materialGroundingDefinitionSchema = z.object({
  term: z.string().min(1),
  definition: z.string().default(""),
  citations: z.array(groundingCitationSchema).default([]),
});
export type MaterialGroundingDefinition = z.infer<typeof materialGroundingDefinitionSchema>;

export const materialGroundingProcedureSchema = z.object({
  name: z.string().min(1),
  summary: z.string().default(""),
  steps: z.array(z.string()).default([]),
  citations: z.array(groundingCitationSchema).default([]),
});
export type MaterialGroundingProcedure = z.infer<typeof materialGroundingProcedureSchema>;

export const materialGroundingFormulaSchema = z.object({
  label: z.string().min(1),
  expression: z.string().min(1),
  conditions: z.string().default(""),
  usageNotes: z.string().default(""),
  citations: z.array(groundingCitationSchema).default([]),
});
export type MaterialGroundingFormula = z.infer<typeof materialGroundingFormulaSchema>;

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
export type MaterialGroundingSegment = z.infer<typeof materialGroundingSegmentSchema>;

export const materialGroundingMapSchema = z.object({
  version: z.number().int().positive().default(LEARNING_NUMERIC_DEFAULTS.initialVersion),
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
export type MaterialCoverageReview = z.infer<typeof materialCoverageReviewSchema>;

export const sessionOpeningStrategySchema = z.enum(
  SESSION_OPENING_STRATEGY_VALUES,
);
export type SessionOpeningStrategy = z.infer<typeof sessionOpeningStrategySchema>;

export const sessionOpeningPlanSchema = z.object({
  strategy: sessionOpeningStrategySchema.default(
    SESSION_OPENING_STRATEGY_VALUES[0],
  ),
  personalizationFrame: z.string().default(""),
  bridgeConcept: z.string().default(""),
  invitationGoal: z.string().default(""),
  rationale: z.string().default(""),
});
export type SessionOpeningPlan = z.infer<typeof sessionOpeningPlanSchema>;

export const learningInteractionTypeSchema = z.enum(
  LEARNING_INTERACTION_TYPE_VALUES,
);
export type LearningInteractionType = z.infer<typeof learningInteractionTypeSchema>;

export const questionIntentSchema = z.enum(QUESTION_INTENT_VALUES);
export type QuestionIntent = z.infer<typeof questionIntentSchema>;

export const sessionComparisonTrendSchema = z.enum(
  SESSION_COMPARISON_TREND_VALUES,
);
export type SessionComparisonTrend = z.infer<typeof sessionComparisonTrendSchema>;

export const studentMasteryLevelSchema = z.enum(STUDENT_MASTERY_LEVEL_VALUES);
export type StudentMasteryLevel = z.infer<typeof studentMasteryLevelSchema>;
