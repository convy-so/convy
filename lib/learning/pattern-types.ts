import { z } from "zod";

export const learningPatternScopeSchema = z.enum(["global", "subject"]);

export type LearningPatternScope = z.infer<typeof learningPatternScopeSchema>;

export const patternConfidenceLabelSchema = z.enum([
  "early",
  "emerging",
  "well_supported",
]);

export type PatternConfidenceLabel = z.infer<
  typeof patternConfidenceLabelSchema
>;

export const explanationApproachTypeSchema = z.enum([
  "direct_conceptual",
  "interest_domain_analogy",
  "outside_domain_analogy",
  "historical_story",
  "visual_spatial",
  "step_by_step",
  "real_world_application",
  "contrast_explanation",
]);

export type ExplanationApproachType = z.infer<
  typeof explanationApproachTypeSchema
>;

export const conceptEntryPointPreferenceSchema = z.enum([
  "big_picture_first",
  "parts_first",
  "mixed",
]);

export const abstractionToleranceSchema = z.enum([
  "example_first",
  "abstract_friendly",
  "mixed",
]);

export const challengeResponsePatternSchema = z.enum([
  "leans_in",
  "threshold_based",
  "avoidant",
]);

export const processingPreferenceSchema = z.enum([
  "fast_broad",
  "slow_deep",
  "mixed",
]);

export const socialLearningOrientationSchema = z.enum([
  "social",
  "independent",
  "mixed",
]);

export const memoryApproachSchema = z.enum([
  "memorization_oriented",
  "understanding_oriented",
  "mixed",
]);

export const relationshipWithWrongSchema = z.enum([
  "safe",
  "guarded",
  "mixed",
]);

export const responseWhenWrongSchema = z.enum(["engaged", "guarded", "mixed"]);

export const misconceptionStatusSchema = z.enum([
  "single_occurrence",
  "recurring",
  "persistent",
]);

export const engagementTrendDirectionSchema = z.enum([
  "upward",
  "stable",
  "declining",
]);

export type EngagementTrendDirection = z.infer<
  typeof engagementTrendDirectionSchema
>;

export const firstSessionDiscoverySchema = z.object({
  conceptEntryPointPreference: conceptEntryPointPreferenceSchema.default(
    "mixed",
  ),
  abstractionTolerance: abstractionToleranceSchema.default("mixed"),
  challengeResponsePattern: challengeResponsePatternSchema.default(
    "threshold_based",
  ),
  processingPreference: processingPreferenceSchema.default("mixed"),
  socialLearningOrientation: socialLearningOrientationSchema.default("mixed"),
  memoryApproach: memoryApproachSchema.default("mixed"),
  relationshipWithBeingWrong: relationshipWithWrongSchema.default("mixed"),
  notes: z.array(z.string()).default([]),
});

export type FirstSessionDiscovery = z.infer<typeof firstSessionDiscoverySchema>;

export const explanationApproachScoreSchema = z.object({
  type: explanationApproachTypeSchema,
  successRate: z.number().min(0).max(1).default(0),
  observationCount: z.number().int().min(0).default(0),
  confidence: z.number().min(0).max(1).default(0),
  notes: z.array(z.string()).default([]),
});

export type ExplanationApproachScore = z.infer<
  typeof explanationApproachScoreSchema
>;

export const interestDomainResonanceSchema = z.object({
  domain: z.string().min(1),
  engagementScore: z.number().min(0).max(1).default(0),
  comprehensionScore: z.number().min(0).max(1).default(0),
  observationCount: z.number().int().min(0).default(0),
  notes: z.array(z.string()).default([]),
});

export type InterestDomainResonance = z.infer<
  typeof interestDomainResonanceSchema
>;

export const cognitivePatternSchema = z.object({
  primaryStyle: z
    .enum(["examples", "analytical", "relational", "divergent", "mixed"])
    .default("mixed"),
  confidence: z.number().min(0).max(1).default(0),
  averageExplanationAttempts: z.number().min(0).default(0),
  applicationStrength: z
    .enum(["stronger_than_recall", "balanced", "weaker_than_recall"])
    .default("balanced"),
  divergentThinkingTendency: z.number().min(0).max(1).default(0),
  notes: z.array(z.string()).default([]),
});

export type CognitivePattern = z.infer<typeof cognitivePatternSchema>;

export const motivationalPatternSchema = z.object({
  primaryMotivationalStyle: z
    .enum([
      "competition",
      "collaboration",
      "future_oriented",
      "present_oriented",
      "autonomy",
      "direction",
      "mixed",
    ])
    .default("mixed"),
  secondaryMotivationalStyle: z
    .enum([
      "competition",
      "collaboration",
      "future_oriented",
      "present_oriented",
      "autonomy",
      "direction",
      "mixed",
    ])
    .default("mixed"),
  engagementTriggers: z.array(z.string()).default([]),
  disengagementTriggers: z.array(z.string()).default([]),
  averageSessionEngagementTrajectory: engagementTrendDirectionSchema.default(
    "stable",
  ),
});

export type MotivationalPattern = z.infer<typeof motivationalPatternSchema>;

export const confidenceMindsetPatternSchema = z.object({
  confidenceHistory: z
    .array(
      z.object({
        sessionId: z.string(),
        confidenceScore: z.number().int().min(1).max(10),
        quizScore: z.number().min(0).max(100),
      }),
    )
    .default([]),
  confidenceGapTrend: z
    .enum(["narrowing", "stable", "widening"])
    .default("stable"),
  responseWhenWrong: responseWhenWrongSchema.default("mixed"),
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
  status: misconceptionStatusSchema.default("single_occurrence"),
  correctionApproachesTried: z.array(z.string()).default([]),
  sessionIds: z.array(z.string()).default([]),
  lastSeenAt: z.string(),
});

export type PersistentMisconception = z.infer<
  typeof persistentMisconceptionSchema
>;

export const engagementTrendSchema = z.object({
  direction: engagementTrendDirectionSchema.default("stable"),
  averageResponseDepth: z.number().min(0).max(1).default(0),
  latestScore: z.number().min(0).max(1).default(0),
  notes: z.array(z.string()).default([]),
});

export type EngagementTrend = z.infer<typeof engagementTrendSchema>;

export const studentLearningPatternProfileSchema = z.object({
  scopeType: learningPatternScopeSchema,
  subjectKey: z.string().nullable().default(null),
  subjectLabel: z.string().nullable().default(null),
  patternConfidence: z.number().min(0).max(1).default(0),
  confidenceLabel: patternConfidenceLabelSchema.default("early"),
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
  subjectLabel: z.string().nullable().default(null),
  memoryClass: z.enum(["observation", "playbook"]).default("observation"),
  dimension: z.string().min(1),
  text: z.string().min(1),
  patternConfidence: z.number().min(0).max(1).default(0),
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
  overallConfidence: z.number().min(0).max(1).default(0),
  confidenceLabel: patternConfidenceLabelSchema.default("early"),
  behaviorWeight: z
    .enum(["supplementary", "favored", "primary"])
    .default("supplementary"),
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
