import { z } from "zod";
import { learningTeachingPlaybookSchema } from "@/lib/learning/pattern-types";
import {
  assessmentQuestionTypeSchema,
  assessmentReasoningSkillSchema,
  curriculumFrameworkKeySchema,
  originalityModeSchema,
  reasoningGoalSchema,
  subjectCompetencySchema,
  transferExpectationSchema,
} from "@/lib/learning/subject-packages";

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
  masteryThreshold: z.number().min(0).max(100).default(70),
  competencyTargets: z.array(subjectCompetencySchema).default([]),
  reasoningGoals: z.array(reasoningGoalSchema).default([]),
  misconceptionTags: z.array(z.string()).default([]),
  questionModes: z.array(assessmentQuestionTypeSchema).default([]),
  transferExpectation: transferExpectationSchema.default("near"),
  curriculumFrameworkKey: curriculumFrameworkKeySchema.default("kmk_de_sek1"),
});

export type LearningOutcomeDefinition = z.infer<
  typeof learningOutcomeDefinitionSchema
>;

export const topicSourceBoundarySchema = z.object({
  teacherSummary: z.string().default(""),
  allowedMaterialIds: z.array(z.string()).default([]),
  groundingMode: z
    .enum(["teacher_material_only", "teacher_material_plus_web_opening"])
    .default("teacher_material_only"),
  webOpeningEnabled: z.boolean().default(false),
  hallucinationPolicy: z
    .string()
    .default(
      "Use source material for factual claims. Use model intelligence only to explain, quiz, and adapt language.",
    ),
});

export type TopicSourceBoundary = z.infer<typeof topicSourceBoundarySchema>;

export const gradeLanguagePolicySchema = z.object({
  gradeBand: gradeBandSchema,
  preferredSentenceLength: z.enum(["short", "medium", "mixed"]),
  explanationStyle: z.array(z.string()).default([]),
  avoidPatterns: z.array(z.string()).default([]),
  quizStyle: z.array(z.string()).default([]),
  encouragementStyle: z.array(z.string()).default([]),
});

export type GradeLanguagePolicy = z.infer<typeof gradeLanguagePolicySchema>;

export const sessionOpeningStrategySchema = z.enum([
  "web_event",
  "web_application",
  "crafted_story",
]);

export type SessionOpeningStrategy = z.infer<
  typeof sessionOpeningStrategySchema
>;

export const sessionOpeningPlanSchema = z.object({
  strategy: sessionOpeningStrategySchema,
  maxSentences: z.number().int().positive().max(4).default(4),
  personalizationFrame: z.string(),
  bridgeConcept: z.string(),
  invitationGoal: z.string(),
  suggestedSearchQueries: z.array(z.string()).default([]),
  rationale: z.string(),
});

export type SessionOpeningPlan = z.infer<typeof sessionOpeningPlanSchema>;

export const sessionPhaseTypeSchema = z.enum([
  "continuity_check",
  "opening_hook",
  "opening_probe",
  "connecting_question",
  "attempt_first",
  "concept_teaching",
  "assessment",
  "quiz",
  "metacognitive_reflection",
  "self_reflection",
  "session_close",
]);

export type SessionPhaseType = z.infer<typeof sessionPhaseTypeSchema>;

export const sessionPhaseStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "skipped",
]);

export type SessionPhaseStatus = z.infer<typeof sessionPhaseStatusSchema>;

export const questionIntentSchema = z.enum([
  "phase_response",
  "clarification",
  "curiosity",
  "off_topic",
]);

export type QuestionIntent = z.infer<typeof questionIntentSchema>;

export const conceptConfidenceSchema = z.enum(["low", "medium", "high"]);

export type ConceptConfidence = z.infer<typeof conceptConfidenceSchema>;

export const quizDifficultySchema = z.enum(["easy", "medium", "hard"]);

export type QuizDifficulty = z.infer<typeof quizDifficultySchema>;

export const homeworkStatusSchema = z.enum([
  "not_applicable",
  "completed_understood",
  "completed_confused",
  "attempted_partial",
  "not_done",
]);

export type HomeworkStatus = z.infer<typeof homeworkStatusSchema>;

export const sessionComparisonTrendSchema = z.enum([
  "improved",
  "steady",
  "regressed",
  "unknown",
]);

export type SessionComparisonTrend = z.infer<
  typeof sessionComparisonTrendSchema
>;

export const learningInteractionTypeSchema = z.enum([
  "phase_prompt",
  "student_response",
  "student_question",
  "agent_answer",
  "assessment_question",
  "assessment_answer",
  "quiz_question",
  "quiz_answer",
  "reflection",
  "homework_check",
  "session_event",
  "out_of_session_question",
]);

export type LearningInteractionType = z.infer<
  typeof learningInteractionTypeSchema
>;

export const sessionConceptSchema = z.object({
  key: z.string(),
  title: z.string(),
  outcomeIds: z.array(z.string()).default([]),
});

export type SessionConcept = z.infer<typeof sessionConceptSchema>;

export const conceptTeachingStateSchema = z.object({
  conceptKey: z.string(),
  conceptTitle: z.string(),
  attemptPrompt: z.string().default(""),
  attemptEvaluated: z.boolean().default(false),
  explanationAttempts: z.number().int().min(0).default(0),
  comprehensionPassed: z.boolean().default(false),
  deepeningDone: z.boolean().default(false),
  studentExplanationGiven: z.boolean().default(false),
  currentStep: z
    .enum([
      "attempt",
      "intro",
      "awaiting_comprehension",
      "awaiting_deepening",
      "bridge",
    ])
    .default("intro"),
  masteryScore: z.number().min(0).max(100).nullable().default(null),
  confidence: conceptConfidenceSchema.nullable().default(null),
  gaps: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  lastAnalogy: z.string().default(""),
  realWorldAnchor: z.string().default(""),
  reasoningScore: z.number().min(0).max(100).nullable().default(null),
  transferScore: z.number().min(0).max(100).nullable().default(null),
  originalityScore: z.number().min(0).max(100).nullable().default(null),
});

export type ConceptTeachingState = z.infer<typeof conceptTeachingStateSchema>;

export const learningSessionPhaseSchema = z.object({
  id: z.number().int().positive(),
  type: sessionPhaseTypeSchema,
  status: sessionPhaseStatusSchema.default("pending"),
  conceptKey: z.string().nullable().default(null),
  attempts: z.number().int().min(0).default(0),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  notes: z.array(z.string()).default([]),
});

export type LearningSessionPhase = z.infer<typeof learningSessionPhaseSchema>;

export const assessmentRubricScoreSchema = z.object({
  dimension: z.string(),
  score: z.number().min(0).max(100),
  note: z.string().default(""),
});

export type AssessmentRubricScore = z.infer<
  typeof assessmentRubricScoreSchema
>;

export const learningAssessmentItemSchema = z.object({
  id: z.string(),
  conceptKey: z.string(),
  prompt: z.string(),
  questionType: assessmentQuestionTypeSchema.default("self_explanation"),
  primaryCompetency: subjectCompetencySchema.default("conceptual_understanding"),
  reasoningSkill: assessmentReasoningSkillSchema.default("mental_model"),
  transferLevel: transferExpectationSchema.default("near"),
  originalityMode: originalityModeSchema.default("constrained_originality"),
  acceptedStrategies: z.array(z.string()).default([]),
  rubric: z.array(assessmentRubricScoreSchema).default([]),
  hintLadder: z.array(z.string()).default([]),
  diagnosticTags: z.array(z.string()).default([]),
  evidenceRequirements: z.array(z.string()).default([]),
  expectedAnswer: z.string().default(""),
  explanation: z.string().default(""),
  difficulty: quizDifficultySchema,
  studentAnswer: z.string().nullable().default(null),
  correct: z.boolean().nullable().default(null),
  score: z.number().min(0).max(100).nullable().default(null),
  reasoningScore: z.number().min(0).max(100).nullable().default(null),
  transferScore: z.number().min(0).max(100).nullable().default(null),
  originalityScore: z.number().min(0).max(100).nullable().default(null),
  helpUsed: z.number().int().min(0).default(0),
});

export type LearningAssessmentItem = z.infer<typeof learningAssessmentItemSchema>;

export const learningQuizItemSchema = learningAssessmentItemSchema;

export type LearningQuizItem = LearningAssessmentItem;

export const reasoningPatternSignalSchema = z.object({
  key: z.string(),
  label: z.string(),
  evidenceCount: z.number().int().min(1).default(1),
  lastSeenAt: z.string(),
  studentFacingSummary: z.string().default(""),
  teacherSummary: z.string().default(""),
});

export type ReasoningPatternSignal = z.infer<typeof reasoningPatternSignalSchema>;

export const metacognitiveMirrorStateSchema = z.object({
  currentStep: z
    .enum([
      "awaiting_pattern_reflection",
      "awaiting_strategy_commitment",
      "awaiting_confidence",
      "awaiting_click_moment",
      "complete",
    ])
    .default("awaiting_pattern_reflection"),
  highlightedPatternKey: z.string().nullable().default(null),
  patternReflection: z.string().nullable().default(null),
  nextStrategyCommitment: z.string().nullable().default(null),
});

export type MetacognitiveMirrorState = z.infer<
  typeof metacognitiveMirrorStateSchema
>;

export const learningReflectionStateSchema = z.object({
  confidenceScore: z.number().int().min(1).max(10).nullable().default(null),
  momentOfUnderstanding: z.string().nullable().default(null),
  currentStep: z
    .enum(["awaiting_confidence", "awaiting_click_moment", "complete"])
    .default("awaiting_confidence"),
});

export type LearningReflectionState = z.infer<
  typeof learningReflectionStateSchema
>;

export const learningSessionStateSchema = z.object({
  topicTitle: z.string().default(""),
  subjectPackageKey: z.string().default("general_science"),
  curriculumFrameworkKey: curriculumFrameworkKeySchema.default("kmk_de_sek1"),
  conceptsToCover: z.array(sessionConceptSchema).default([]),
  phases: z.array(learningSessionPhaseSchema).default([]),
  currentPhaseId: z.number().int().positive().default(1),
  previousSessionId: z.string().nullable().default(null),
  previousSessionSummary: z.string().default(""),
  homeworkFromPreviousSession: z.array(z.string()).default([]),
  homeworkStatus: homeworkStatusSchema.default("not_applicable"),
  gapsIdentified: z.array(z.string()).default([]),
  completedConceptKeys: z.array(z.string()).default([]),
  conceptStates: z.record(z.string(), conceptTeachingStateSchema).default({}),
  openingHook: z.string().default(""),
  openingProbe: z.string().default(""),
  openingProbeAssessment: z.enum(["strong", "partial", "weak"]).nullable().default(null),
  connectingQuestion: z.string().default(""),
  quizItems: z.array(learningAssessmentItemSchema).default([]),
  quizTargetCount: z.number().int().min(1).max(7).default(5),
  quizCurrentIndex: z.number().int().min(0).default(0),
  reflection: learningReflectionStateSchema.default({}),
  reasoningQualityScore: z.number().min(0).max(100).nullable().default(null),
  strategyDiversityScore: z.number().min(0).max(100).nullable().default(null),
  transferPerformanceScore: z.number().min(0).max(100).nullable().default(null),
  helpDependenceScore: z.number().min(0).max(100).nullable().default(null),
  confidenceCalibrationScore: z.number().min(0).max(100).nullable().default(null),
  originalityScore: z.number().min(0).max(100).nullable().default(null),
  metacognitiveHabits: z.array(z.string()).default([]),
  thinkingPatternSignals: z.array(reasoningPatternSignalSchema).default([]),
  metacognitiveMirror: metacognitiveMirrorStateSchema.default({}),
  personalizedHomework: z.array(z.string()).default([]),
  studentConfidenceScore: z.number().int().min(1).max(10).nullable().default(null),
  momentOfUnderstanding: z.string().nullable().default(null),
  learnerGoal: z.string().default(""),
  usedExampleLog: z.array(z.string()).default([]),
  teachingPlaybook: learningTeachingPlaybookSchema.nullable().default(null),
  reportReady: z.boolean().default(false),
});

export type LearningSessionState = z.infer<typeof learningSessionStateSchema>;

export const defaultLearningSessionState = learningSessionStateSchema.parse({});

export function createDefaultLearningSessionState(): LearningSessionState {
  return learningSessionStateSchema.parse({});
}

export const conceptPerformanceSchema = z.object({
  concept: z.string(),
  score: z.number().min(0).max(100),
  confidenceLevel: conceptConfidenceSchema,
  explanationAttempts: z.number().int().min(0),
  status: z.enum(["mastered", "developing", "needs_support"]),
});

export type ConceptPerformance = z.infer<typeof conceptPerformanceSchema>;

export const teacherProgressReportSchema = z.object({
  studentName: z.string(),
  topicTitle: z.string(),
  studentSummary: z.string(),
  reasoningSummary: z.string().default(""),
  conceptsCovered: z.array(z.string()).default([]),
  sessionDurationMinutes: z.number().min(0).default(0),
  sessionCompleted: z.boolean().default(false),
  performanceByConcept: z.array(conceptPerformanceSchema).default([]),
  questionsAskedByStudent: z
    .array(
      z.object({
        content: z.string(),
        type: questionIntentSchema,
      }),
    )
    .default([]),
  quizResults: z
    .array(
      z.object({
        concept: z.string(),
        prompt: z.string(),
        studentAnswer: z.string().default(""),
        correct: z.boolean(),
        difficulty: quizDifficultySchema,
        explanation: z.string().default(""),
      }),
    )
    .default([]),
  identifiedGaps: z.array(z.string()).default([]),
  homeworkAssigned: z.array(z.string()).default([]),
  homeworkStatus: homeworkStatusSchema.default("not_applicable"),
  studentConfidenceScore: z.number().int().min(1).max(10).nullable().default(null),
  momentOfUnderstanding: z.string().nullable().default(null),
  comparisonToPreviousSession: z.string().default(""),
  comparisonTrend: sessionComparisonTrendSchema.default("unknown"),
  recommendedTeacherActions: z.array(z.string()).default([]),
  evidence: z
    .array(
      z.object({
        type: z.enum(["question", "quiz", "reflection", "homework", "continuity"]),
        note: z.string(),
      }),
    )
    .default([]),
  riskFlags: z.array(z.string()).default([]),
  reasoningStrengths: z.array(z.string()).default([]),
  persistentMisconceptions: z.array(z.string()).default([]),
  transferReadiness: z
    .enum(["not_yet", "emerging", "ready"])
    .default("not_yet"),
  originalityWithinConstraint: z
    .enum(["low", "emerging", "strong"])
    .default("low"),
  confidenceGap: z.string().default(""),
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

export const tutorRuntimeModeSchema = z.enum(["workflow", "agent", "hybrid"]);

export type TutorRuntimeMode = z.infer<typeof tutorRuntimeModeSchema>;
