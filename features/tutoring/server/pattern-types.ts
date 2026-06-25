import { z } from "zod";
import {
  ABSTRACTION_TOLERANCE_VALUES,
  APPLICATION_STRENGTH_VALUES,
  COGNITIVE_PATTERN_STYLE_VALUES,
  CONCEPT_ENTRY_POINT_PREFERENCE_VALUES,
  CONFIDENCE_GAP_TREND_VALUES,
  ENGAGEMENT_TREND_DIRECTION_VALUES,
  EXPLANATION_APPROACH_TYPE_VALUES,
  LEARNING_MEMORY_CLASS_VALUES,
  LEARNING_PATTERN_SCOPE_VALUES,
  LEARNING_PLAYBOOK_BEHAVIOR_WEIGHT_VALUES,
  MISCONCEPTION_STATUS_VALUES,
  NORMALIZED_SCORE_RANGE,
  PATTERN_CONFIDENCE_LABEL_VALUES,
  PERCENTAGE_RANGE,
  PRIMARY_MOTIVATIONAL_STYLE_VALUES,
  PROCESSING_PREFERENCE_VALUES,
  RELATIONSHIP_WITH_WRONG_VALUES,
  RESPONSE_WHEN_WRONG_VALUES,
  SOCIAL_LEARNING_ORIENTATION_VALUES,
  TEN_POINT_SCORE_RANGE,
  CHALLENGE_RESPONSE_PATTERN_VALUES,
  MEMORY_APPROACH_VALUES,
} from "@/shared/learning/constants";

export const learningPatternScopeSchema = z.enum(LEARNING_PATTERN_SCOPE_VALUES);

export type LearningPatternScope = z.infer<typeof learningPatternScopeSchema>;

export const patternConfidenceLabelSchema = z.enum(
  PATTERN_CONFIDENCE_LABEL_VALUES,
);

export type PatternConfidenceLabel = z.infer<
  typeof patternConfidenceLabelSchema
>;

export const explanationApproachTypeSchema = z.enum(
  EXPLANATION_APPROACH_TYPE_VALUES,
);

export type ExplanationApproachType = z.infer<
  typeof explanationApproachTypeSchema
>;

export const conceptEntryPointPreferenceSchema = z.enum(
  CONCEPT_ENTRY_POINT_PREFERENCE_VALUES,
);

export const abstractionToleranceSchema = z.enum(ABSTRACTION_TOLERANCE_VALUES);

export const challengeResponsePatternSchema = z.enum(
  CHALLENGE_RESPONSE_PATTERN_VALUES,
);

export const processingPreferenceSchema = z.enum(PROCESSING_PREFERENCE_VALUES);

export const socialLearningOrientationSchema = z.enum(
  SOCIAL_LEARNING_ORIENTATION_VALUES,
);

export const memoryApproachSchema = z.enum(MEMORY_APPROACH_VALUES);

export const relationshipWithWrongSchema = z.enum(
  RELATIONSHIP_WITH_WRONG_VALUES,
);

export const responseWhenWrongSchema = z.enum(RESPONSE_WHEN_WRONG_VALUES);

export const misconceptionStatusSchema = z.enum(MISCONCEPTION_STATUS_VALUES);

export const engagementTrendDirectionSchema = z.enum(
  ENGAGEMENT_TREND_DIRECTION_VALUES,
);

export type EngagementTrendDirection = z.infer<
  typeof engagementTrendDirectionSchema
>;

export const firstSessionDiscoverySchema = z.object({
  conceptEntryPointPreference: conceptEntryPointPreferenceSchema.default(
    CONCEPT_ENTRY_POINT_PREFERENCE_VALUES[2],
  ),
  abstractionTolerance: abstractionToleranceSchema.default(
    ABSTRACTION_TOLERANCE_VALUES[2],
  ),
  challengeResponsePattern: challengeResponsePatternSchema.default(
    CHALLENGE_RESPONSE_PATTERN_VALUES[1],
  ),
  processingPreference: processingPreferenceSchema.default(
    PROCESSING_PREFERENCE_VALUES[2],
  ),
  socialLearningOrientation: socialLearningOrientationSchema.default(
    SOCIAL_LEARNING_ORIENTATION_VALUES[2],
  ),
  memoryApproach: memoryApproachSchema.default(MEMORY_APPROACH_VALUES[2]),
  relationshipWithBeingWrong: relationshipWithWrongSchema.default(
    RELATIONSHIP_WITH_WRONG_VALUES[2],
  ),
  notes: z.array(z.string()).default([]),
});

export type FirstSessionDiscovery = z.infer<typeof firstSessionDiscoverySchema>;

export const explanationApproachScoreSchema = z.object({
  type: explanationApproachTypeSchema,
  successRate: z
    .number()
    .min(NORMALIZED_SCORE_RANGE.min)
    .max(NORMALIZED_SCORE_RANGE.max)
    .default(NORMALIZED_SCORE_RANGE.defaultValue),
  observationCount: z.number().int().min(0).default(0),
  confidence: z
    .number()
    .min(NORMALIZED_SCORE_RANGE.min)
    .max(NORMALIZED_SCORE_RANGE.max)
    .default(NORMALIZED_SCORE_RANGE.defaultValue),
  notes: z.array(z.string()).default([]),
});

export type ExplanationApproachScore = z.infer<
  typeof explanationApproachScoreSchema
>;

export const interestDomainResonanceSchema = z.object({
  domain: z.string().min(1),
  engagementScore: z
    .number()
    .min(NORMALIZED_SCORE_RANGE.min)
    .max(NORMALIZED_SCORE_RANGE.max)
    .default(NORMALIZED_SCORE_RANGE.defaultValue),
  comprehensionScore: z
    .number()
    .min(NORMALIZED_SCORE_RANGE.min)
    .max(NORMALIZED_SCORE_RANGE.max)
    .default(NORMALIZED_SCORE_RANGE.defaultValue),
  observationCount: z.number().int().min(0).default(0),
  notes: z.array(z.string()).default([]),
});

export type InterestDomainResonance = z.infer<
  typeof interestDomainResonanceSchema
>;

export const cognitivePatternSchema = z.object({
  primaryStyle: z
    .enum(COGNITIVE_PATTERN_STYLE_VALUES)
    .default(COGNITIVE_PATTERN_STYLE_VALUES[4]),
  confidence: z
    .number()
    .min(NORMALIZED_SCORE_RANGE.min)
    .max(NORMALIZED_SCORE_RANGE.max)
    .default(NORMALIZED_SCORE_RANGE.defaultValue),
  averageExplanationAttempts: z.number().min(0).default(0),
  applicationStrength: z
    .enum(APPLICATION_STRENGTH_VALUES)
    .default(APPLICATION_STRENGTH_VALUES[1]),
  divergentThinkingTendency: z
    .number()
    .min(NORMALIZED_SCORE_RANGE.min)
    .max(NORMALIZED_SCORE_RANGE.max)
    .default(NORMALIZED_SCORE_RANGE.defaultValue),
  notes: z.array(z.string()).default([]),
});

export type CognitivePattern = z.infer<typeof cognitivePatternSchema>;

export const motivationalPatternSchema = z.object({
  primaryMotivationalStyle: z
    .enum(PRIMARY_MOTIVATIONAL_STYLE_VALUES)
    .default(PRIMARY_MOTIVATIONAL_STYLE_VALUES[6]),
  secondaryMotivationalStyle: z
    .enum(PRIMARY_MOTIVATIONAL_STYLE_VALUES)
    .default(PRIMARY_MOTIVATIONAL_STYLE_VALUES[6]),
  engagementTriggers: z.array(z.string()).default([]),
  disengagementTriggers: z.array(z.string()).default([]),
  averageSessionEngagementTrajectory: engagementTrendDirectionSchema.default(
    ENGAGEMENT_TREND_DIRECTION_VALUES[1],
  ),
});

export type MotivationalPattern = z.infer<typeof motivationalPatternSchema>;

export const confidenceMindsetPatternSchema = z.object({
  confidenceHistory: z
    .array(
      z.object({
        sessionId: z.string(),
        confidenceScore: z
          .number()
          .int()
          .min(TEN_POINT_SCORE_RANGE.min)
          .max(TEN_POINT_SCORE_RANGE.max),
        quizScore: z
          .number()
          .min(PERCENTAGE_RANGE.min)
          .max(PERCENTAGE_RANGE.max),
      }),
    )
    .default([]),
  confidenceGapTrend: z
    .enum(CONFIDENCE_GAP_TREND_VALUES)
    .default(CONFIDENCE_GAP_TREND_VALUES[1]),
  responseWhenWrong: responseWhenWrongSchema.default(
    RESPONSE_WHEN_WRONG_VALUES[2],
  ),
  requiresConfidenceBuilding: z.boolean().default(false),
  notes: z.array(z.string()).default([]),
});

export type ConfidenceMindsetPattern = z.infer<
  typeof confidenceMindsetPatternSchema
>;

export const persistentMisconceptionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  recurrenceCount: z.number().int().min(1).default(1),
  status: misconceptionStatusSchema.default(MISCONCEPTION_STATUS_VALUES[0]),
  correctionApproachesTried: z.array(z.string()).default([]),
  sessionIds: z.array(z.string()).default([]),
  lastSeenAt: z.string(),
});

export type PersistentMisconception = z.infer<
  typeof persistentMisconceptionSchema
>;

export const engagementTrendSchema = z.object({
  direction: engagementTrendDirectionSchema.default(
    ENGAGEMENT_TREND_DIRECTION_VALUES[1],
  ),
  averageResponseDepth: z
    .number()
    .min(NORMALIZED_SCORE_RANGE.min)
    .max(NORMALIZED_SCORE_RANGE.max)
    .default(NORMALIZED_SCORE_RANGE.defaultValue),
  latestScore: z
    .number()
    .min(NORMALIZED_SCORE_RANGE.min)
    .max(NORMALIZED_SCORE_RANGE.max)
    .default(NORMALIZED_SCORE_RANGE.defaultValue),
  notes: z.array(z.string()).default([]),
});

export type EngagementTrend = z.infer<typeof engagementTrendSchema>;

export const studentLearningPatternProfileSchema = z.object({
  scopeType: learningPatternScopeSchema,
  subjectKey: z.string().nullable().default(null),
  patternConfidence: z
    .number()
    .min(NORMALIZED_SCORE_RANGE.min)
    .max(NORMALIZED_SCORE_RANGE.max)
    .default(NORMALIZED_SCORE_RANGE.defaultValue),
  confidenceLabel: patternConfidenceLabelSchema.default(
    PATTERN_CONFIDENCE_LABEL_VALUES[0],
  ),
  onboardingObservations: z.string().default(""),
  firstSessionDiscovery: firstSessionDiscoverySchema.default({}),
  explanationApproaches: z.array(explanationApproachScoreSchema).default([]),
  interestResonance: z
    .object({
      domains: z.array(interestDomainResonanceSchema).default([]),
      usedExamples: z.array(z.string()).default([]),
      emergingThreads: z.array(z.string()).default([]),
    })
    .default({}),
  cognitivePattern: cognitivePatternSchema.default({}),
  motivationalPattern: motivationalPatternSchema.default({}),
  confidenceMindsetPattern: confidenceMindsetPatternSchema.default({}),
  persistentMisconceptions: z.array(persistentMisconceptionSchema).default([]),
  engagementTrend: engagementTrendSchema.default({}),
  studentSummary: z.string().default(""),
  teacherSummary: z.string().default(""),
  updatedAt: z.string(),
});

export type StudentLearningPatternProfile = z.infer<
  typeof studentLearningPatternProfileSchema
>;

export const learningPatternObservationSchema = z.object({
  scopeType: learningPatternScopeSchema,
  subjectKey: z.string().nullable().default(null),
  memoryClass: z
    .enum(LEARNING_MEMORY_CLASS_VALUES)
    .default(LEARNING_MEMORY_CLASS_VALUES[0]),
  dimension: z.string().min(1),
  text: z.string().min(1),
  patternConfidence: z
    .number()
    .min(NORMALIZED_SCORE_RANGE.min)
    .max(NORMALIZED_SCORE_RANGE.max)
    .default(NORMALIZED_SCORE_RANGE.defaultValue),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type LearningPatternObservation = z.infer<
  typeof learningPatternObservationSchema
>;

export const learningPatternAnalysisOutputSchema = z.object({
  profiles: z.array(studentLearningPatternProfileSchema).min(1),
  observations: z.array(learningPatternObservationSchema).default([]),
});

export type LearningPatternAnalysisOutput = z.infer<
  typeof learningPatternAnalysisOutputSchema
>;

export const learningPlaybookMisconceptionSchema = z.object({
  label: z.string(),
  status: misconceptionStatusSchema,
  guidance: z.string(),
});

export type LearningPlaybookMisconception = z.infer<
  typeof learningPlaybookMisconceptionSchema
>;

export const learningTeachingPlaybookSchema = z.object({
  overallConfidence: z
    .number()
    .min(NORMALIZED_SCORE_RANGE.min)
    .max(NORMALIZED_SCORE_RANGE.max)
    .default(NORMALIZED_SCORE_RANGE.defaultValue),
  confidenceLabel: patternConfidenceLabelSchema.default(
    PATTERN_CONFIDENCE_LABEL_VALUES[0],
  ),
  behaviorWeight: z
    .enum(LEARNING_PLAYBOOK_BEHAVIOR_WEIGHT_VALUES)
    .default(LEARNING_PLAYBOOK_BEHAVIOR_WEIGHT_VALUES[0]),
  topExplanationApproaches: z.array(explanationApproachTypeSchema).default([]),
  preferredInterestDomains: z.array(z.string()).default([]),
  cognitiveGuidance: z.array(z.string()).default([]),
  motivationalGuidance: z.array(z.string()).default([]),
  confidenceGuardrails: z.array(z.string()).default([]),
  relevantMisconceptions: z.array(learningPlaybookMisconceptionSchema).default([]),
  usedExampleReferences: z.array(z.string()).default([]),
  sourceScopesUsed: z.array(z.string()).default([]),
  updatedAt: z.string(),
});

export type LearningTeachingPlaybook = z.infer<
  typeof learningTeachingPlaybookSchema
>;
