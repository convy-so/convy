import { z } from "zod";

import {
  activeExpertGuidanceBundleSchema,
} from "@/features/tutoring/server/expert-framework-schemas";
import {
  groundingCitationSchema,
  learningOutcomeDefinitionSchema,
  sessionComparisonTrendSchema,
  studentMasteryLevelSchema,
} from "@/features/tutoring/server/lesson-foundation-schemas";
import {
  TUTORING_DEFAULT_LOCALE,
  TUTORING_NUMERIC_DEFAULTS,
  PRODUCTIVE_STRUGGLE_READINESS,
  PRODUCTIVE_STRUGGLE_READINESS_VALUES,
  PRODUCTIVE_STRUGGLE_TARGET_BAND,
  PRODUCTIVE_STRUGGLE_TARGET_BAND_VALUES,
  REPORT_INTERVENTION_RECOMMENDATION,
  REPORT_INTERVENTION_RECOMMENDATION_VALUES,
  REPORT_ORIGINALITY_LEVEL,
  REPORT_ORIGINALITY_LEVEL_VALUES,
  REPORT_TRANSFER_READINESS,
  REPORT_TRANSFER_READINESS_VALUES,
  SESSION_COMPARISON_TREND,
  TEN_POINT_SCORE_RANGE,
} from "@/shared/tutoring/constants";

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
export type CognitiveStyleCalibration = z.infer<typeof cognitiveStyleCalibrationSchema>;

export const productiveStruggleCalibrationSchema = z.object({
  targetBand: z
    .enum(PRODUCTIVE_STRUGGLE_TARGET_BAND_VALUES)
    .default(PRODUCTIVE_STRUGGLE_TARGET_BAND.BALANCED),
  signals: z.array(z.string()).default([]),
  currentReadiness: z
    .enum(PRODUCTIVE_STRUGGLE_READINESS_VALUES)
    .default(PRODUCTIVE_STRUGGLE_READINESS.STEADY),
  recoverySupports: z.array(z.string()).default([]),
  summary: z.string().default(""),
});
export type ProductiveStruggleCalibration = z.infer<typeof productiveStruggleCalibrationSchema>;

export const longitudinalDevelopmentSchema = z.object({
  betterQuestionSignals: z.array(z.string()).default([]),
  transferSignals: z.array(z.string()).default([]),
  precisionSignals: z.array(z.string()).default([]),
  selfMonitoringSignals: z.array(z.string()).default([]),
  anomalies: z.array(z.string()).default([]),
  summary: z.string().default(""),
});
export type LongitudinalDevelopment = z.infer<typeof longitudinalDevelopmentSchema>;

export const lessonGroundingFormulaSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  expression: z.string().min(1),
  conditions: z.string().default(""),
  usageNotes: z.string().default(""),
  citations: z.array(groundingCitationSchema).default([]),
});
export type LessonGroundingFormula = z.infer<typeof lessonGroundingFormulaSchema>;

export const lessonGroundingSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().default(""),
  keyPoints: z.array(z.string()).default([]),
  citations: z.array(groundingCitationSchema).default([]),
});
export type LessonGroundingSection = z.infer<typeof lessonGroundingSectionSchema>;

export const lessonGroundingConceptSchema = z.object({
  name: z.string().min(1),
  summary: z.string().default(""),
  citations: z.array(groundingCitationSchema).default([]),
});

export const lessonGroundingPackSchema = z.object({
  version: z.number().int().positive(),
  builtAt: z.string().min(1),
  materialIds: z.array(z.string()).default([]),
  lessonTitle: z.string().default(""),
  digest: z.string().default(""),
  inScopeConcepts: z.array(lessonGroundingConceptSchema).default([]),
  explicitlyOutOfScope: z.array(z.string()).default([]),
  formulas: z.array(lessonGroundingFormulaSchema).default([]),
  sections: z.array(lessonGroundingSectionSchema).default([]),
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
export type LessonGroundingPack = z.infer<typeof lessonGroundingPackSchema>;

export const contentScopeSnapshotSchema = z.object({
  lessonId: z.string().nullable().default(null),
  lessonTitle: z.string().default(""),
  contentLocale: z.string().default(TUTORING_DEFAULT_LOCALE),
  teacherSummary: z.string().default(""),
  materialIds: z.array(z.string()).default([]),
  scopeNotes: z.array(z.string()).default([]),
  notationNotes: z.array(z.string()).default([]),
  rigorNotes: z.array(z.string()).default([]),
  retrievedContext: z.array(z.string()).default([]),
  learningOutcomes: z.array(learningOutcomeDefinitionSchema).optional().default([]),
  groundingPackVersion: z.number().int().nonnegative().default(TUTORING_NUMERIC_DEFAULTS.zero),
  lessonGroundingPack: lessonGroundingPackSchema.nullable().default(null),
});
export type ContentScopeSnapshot = z.infer<typeof contentScopeSnapshotSchema>;

export const studentSessionStateSchema = z.object({
  lessonId: z.string().nullable().default(null),
  lessonTitle: z.string().default(""),
  frameworkId: z.string().nullable().default(null),
  activeFrameworkSnapshot: activeExpertGuidanceBundleSchema.nullable().default(null),
  groundingPackVersion: z.number().int().nonnegative().default(TUTORING_NUMERIC_DEFAULTS.zero),
  contentScopeSnapshot: contentScopeSnapshotSchema.nullable().default(null),
  recentMessageSummary: z.string().default(""),
  recentEvidence: z.array(z.string()).default([]),
  tutorNotes: z.array(z.string()).default([]),
  turnCount: z.number().int().nonnegative().default(TUTORING_NUMERIC_DEFAULTS.zero),
  reportReady: z.boolean().default(false),
  completed: z.boolean().default(false),
  completionRequestedAt: z.string().nullable().default(null),
});
export type StudentSessionState = z.infer<typeof studentSessionStateSchema>;

export const defaultStudentSessionState = studentSessionStateSchema.parse({});

export function createDefaultStudentSessionState(): StudentSessionState {
  return studentSessionStateSchema.parse({});
}

export const teacherProgressReportSchema = z.object({
  studentName: z.string(),
  lessonTitle: z.string(),
  studentSummary: z.string(),
  pedagogicalSummary: z.string().default(""),
  frameworkPhase: z.string().default(""),
  frameworkLevel: z.string().default(""),
  frameworkProgressSummary: z.string().default(""),
  conceptProgress: z.array(
    z.object({
      conceptKey: z.string(),
      title: z.string(),
      masteryLevel: studentMasteryLevelSchema,
      confidence: z.number().min(0).max(1).default(0),
      misconceptions: z.array(z.string()).default([]),
      evidence: z.array(z.string()).default([]),
    }),
  ).default([]),
  motivationalHooksUsed: z.array(z.string()).default([]),
  productiveStruggleNotes: z.array(z.string()).default([]),
  longitudinalSignals: z.array(z.string()).default([]),
  recommendedTeacherActions: z.array(z.string()).default([]),
  homeworkAssigned: z.array(z.string()).default([]),
  studentConfidenceScore: z
    .number()
    .int()
    .min(TEN_POINT_SCORE_RANGE.min)
    .max(TEN_POINT_SCORE_RANGE.max)
    .nullable()
    .default(null),
  expertReviewRecommended: z.boolean().default(false),
  expertReviewReason: z.string().default(""),
  identifiedGaps: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
  comparisonToPreviousSession: z.string().default(""),
  comparisonTrend: sessionComparisonTrendSchema.default(SESSION_COMPARISON_TREND.UNKNOWN),
  transferReadiness: z
    .enum(REPORT_TRANSFER_READINESS_VALUES)
    .default(REPORT_TRANSFER_READINESS.NOT_YET),
  originalityWithinConstraint: z
    .enum(REPORT_ORIGINALITY_LEVEL_VALUES)
    .default(REPORT_ORIGINALITY_LEVEL.LOW),
  recommendedInterventionType: z
    .enum(REPORT_INTERVENTION_RECOMMENDATION_VALUES)
    .default(REPORT_INTERVENTION_RECOMMENDATION.NONE),
  metacognitiveMirror: z.string().default(""),
});
export type TeacherProgressReport = z.infer<typeof teacherProgressReportSchema>;

export const teacherOnboardingSummarySchema = z.object({
  summary: z.string(),
});
export type TeacherOnboardingSummary = z.infer<typeof teacherOnboardingSummarySchema>;


