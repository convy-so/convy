import { z } from "zod";

export const curriculumFrameworkKeySchema = z.enum([
  "kmk_de_sek1",
  "kmk_de_oberstufe",
]);

export type CurriculumFrameworkKey = z.infer<
  typeof curriculumFrameworkKeySchema
>;

export const subjectPackageKeySchema = z.enum([
  "mathematics",
  "physics",
  "chemistry",
  "biology",
  "general_science",
]);

export type SubjectPackageKey = z.infer<typeof subjectPackageKeySchema>;

export const subjectCompetencySchema = z.enum([
  "conceptual_understanding",
  "problem_solving",
  "modeling",
  "argumentation",
  "representation",
  "communication",
  "evaluation",
  "inquiry",
  "evidence_reasoning",
  "mechanistic_reasoning",
  "systems_thinking",
]);

export type SubjectCompetency = z.infer<typeof subjectCompetencySchema>;

export const reasoningGoalSchema = z.enum([
  "explain_in_own_words",
  "justify_steps",
  "compare_strategies",
  "diagnose_errors",
  "transfer_to_new_context",
  "evaluate_assumptions",
  "check_units_or_constraints",
  "connect_representations",
  "generate_valid_approach",
  "reflect_on_thinking",
]);

export type ReasoningGoal = z.infer<typeof reasoningGoalSchema>;

export const assessmentQuestionTypeSchema = z.enum([
  "retrieval_check",
  "self_explanation",
  "worked_step_diagnosis",
  "error_analysis",
  "compare_two_solutions",
  "transfer_challenge",
  "constraint_change",
  "problem_posing",
  "metacognitive_reflection",
]);

export type AssessmentQuestionType = z.infer<
  typeof assessmentQuestionTypeSchema
>;

export const assessmentReasoningSkillSchema = z.enum([
  "mental_model",
  "justification",
  "comparison",
  "error_detection",
  "transfer",
  "assumption_checking",
  "representation_translation",
  "strategy_generation",
  "reflection",
]);

export type AssessmentReasoningSkill = z.infer<
  typeof assessmentReasoningSkillSchema
>;

export const transferExpectationSchema = z.enum([
  "none",
  "near",
  "far",
]);

export type TransferExpectation = z.infer<typeof transferExpectationSchema>;

export const originalityModeSchema = z.enum([
  "single_correct_path",
  "multiple_valid_strategies",
  "constrained_originality",
]);

export type OriginalityMode = z.infer<typeof originalityModeSchema>;

export const subjectPackageDefinitionSchema = z.object({
  key: subjectPackageKeySchema,
  label: z.string(),
  curriculumFrameworkKey: curriculumFrameworkKeySchema.default("kmk_de_sek1"),
  competencyModel: z.array(subjectCompetencySchema).min(1),
  supportedQuestionTypes: z.array(assessmentQuestionTypeSchema).min(1),
  supportedReasoningSkills: z.array(assessmentReasoningSkillSchema).min(1),
  acceptedEvidenceSignals: z.array(z.string()).default([]),
  originalityModes: z.array(originalityModeSchema).min(1),
  misconceptionFocus: z.array(z.string()).default([]),
  challengeSequence: z.array(assessmentQuestionTypeSchema).min(3),
  teacherGuidance: z.array(z.string()).default([]),
});

export type SubjectPackageDefinition = z.infer<
  typeof subjectPackageDefinitionSchema
>;

export const teacherSessionSubjectKeys = [
  "mathematics",
  "physics",
] as const;

export type TeacherSessionSubjectKey = (typeof teacherSessionSubjectKeys)[number];

const SUBJECT_PACKAGES: Record<SubjectPackageKey, SubjectPackageDefinition> = {
  mathematics: subjectPackageDefinitionSchema.parse({
    key: "mathematics",
    label: "Mathematics",
    competencyModel: [
      "conceptual_understanding",
      "problem_solving",
      "modeling",
      "argumentation",
      "representation",
      "communication",
    ],
    supportedQuestionTypes: [
      "self_explanation",
      "worked_step_diagnosis",
      "error_analysis",
      "compare_two_solutions",
      "transfer_challenge",
      "constraint_change",
      "problem_posing",
      "metacognitive_reflection",
      "retrieval_check",
    ],
    supportedReasoningSkills: [
      "mental_model",
      "justification",
      "comparison",
      "error_detection",
      "transfer",
      "representation_translation",
      "strategy_generation",
      "reflection",
    ],
    acceptedEvidenceSignals: [
      "explains why a transformation is valid",
      "offers more than one valid method",
      "checks whether an answer is reasonable",
      "uses counterexamples or contrasts",
    ],
    originalityModes: [
      "multiple_valid_strategies",
      "constrained_originality",
    ],
    misconceptionFocus: [
      "premature formula use",
      "unjustified algebra steps",
      "answer without explanation",
      "single-path fixation",
    ],
    challengeSequence: [
      "self_explanation",
      "compare_two_solutions",
      "transfer_challenge",
      "constraint_change",
    ],
    teacherGuidance: [
      "Reward justified alternate approaches.",
      "Do not treat unfamiliar but valid methods as errors.",
    ],
  }),
  physics: subjectPackageDefinitionSchema.parse({
    key: "physics",
    label: "Physics",
    competencyModel: [
      "conceptual_understanding",
      "problem_solving",
      "modeling",
      "evaluation",
      "inquiry",
      "evidence_reasoning",
    ],
    supportedQuestionTypes: [
      "self_explanation",
      "worked_step_diagnosis",
      "error_analysis",
      "compare_two_solutions",
      "transfer_challenge",
      "constraint_change",
      "metacognitive_reflection",
      "retrieval_check",
    ],
    supportedReasoningSkills: [
      "mental_model",
      "justification",
      "comparison",
      "error_detection",
      "transfer",
      "assumption_checking",
      "reflection",
    ],
    acceptedEvidenceSignals: [
      "identifies assumptions and model limits",
      "checks units or dimensions",
      "connects equations to phenomena",
      "compares model prediction to data or situation",
    ],
    originalityModes: [
      "single_correct_path",
      "constrained_originality",
    ],
    misconceptionFocus: [
      "unit skipping",
      "formula matching without model choice",
      "ignoring assumptions",
      "symbol pushing detached from phenomenon",
    ],
    challengeSequence: [
      "self_explanation",
      "error_analysis",
      "transfer_challenge",
      "metacognitive_reflection",
    ],
    teacherGuidance: [
      "Require students to state assumptions before calculating when relevant.",
      "Prefer reasoning about model choice over plugging into formulas.",
    ],
  }),
  chemistry: subjectPackageDefinitionSchema.parse({
    key: "chemistry",
    label: "Chemistry",
    competencyModel: [
      "conceptual_understanding",
      "problem_solving",
      "representation",
      "evaluation",
      "communication",
      "evidence_reasoning",
    ],
    supportedQuestionTypes: [
      "self_explanation",
      "worked_step_diagnosis",
      "error_analysis",
      "compare_two_solutions",
      "transfer_challenge",
      "constraint_change",
      "metacognitive_reflection",
      "retrieval_check",
    ],
    supportedReasoningSkills: [
      "mental_model",
      "justification",
      "comparison",
      "error_detection",
      "transfer",
      "representation_translation",
      "reflection",
    ],
    acceptedEvidenceSignals: [
      "moves correctly between symbolic, macroscopic, and particulate views",
      "justifies reaction or equilibrium reasoning",
      "distinguishes observation from explanation",
    ],
    originalityModes: [
      "single_correct_path",
      "constrained_originality",
    ],
    misconceptionFocus: [
      "symbol manipulation without particulate reasoning",
      "confusing observations with mechanisms",
      "ignoring conservation constraints",
    ],
    challengeSequence: [
      "self_explanation",
      "worked_step_diagnosis",
      "transfer_challenge",
      "constraint_change",
    ],
    teacherGuidance: [
      "Force representation switching when understanding is shallow.",
      "Ask what particles are doing, not only what symbols say.",
    ],
  }),
  biology: subjectPackageDefinitionSchema.parse({
    key: "biology",
    label: "Biology",
    competencyModel: [
      "conceptual_understanding",
      "evaluation",
      "communication",
      "inquiry",
      "evidence_reasoning",
      "mechanistic_reasoning",
      "systems_thinking",
    ],
    supportedQuestionTypes: [
      "self_explanation",
      "error_analysis",
      "compare_two_solutions",
      "transfer_challenge",
      "constraint_change",
      "problem_posing",
      "metacognitive_reflection",
      "retrieval_check",
    ],
    supportedReasoningSkills: [
      "mental_model",
      "justification",
      "comparison",
      "error_detection",
      "transfer",
      "strategy_generation",
      "reflection",
    ],
    acceptedEvidenceSignals: [
      "uses claim-evidence-reasoning",
      "explains mechanisms instead of listing facts",
      "connects parts of a system and predicts changes",
    ],
    originalityModes: [
      "multiple_valid_strategies",
      "constrained_originality",
    ],
    misconceptionFocus: [
      "fact listing instead of mechanism",
      "teleological explanations",
      "weak evidence linkage",
    ],
    challengeSequence: [
      "self_explanation",
      "compare_two_solutions",
      "transfer_challenge",
      "problem_posing",
    ],
    teacherGuidance: [
      "Push mechanism and evidence before terminology.",
      "Treat recall-only answers as incomplete understanding.",
    ],
  }),
  general_science: subjectPackageDefinitionSchema.parse({
    key: "general_science",
    label: "General Science",
    competencyModel: [
      "conceptual_understanding",
      "problem_solving",
      "evaluation",
      "communication",
      "inquiry",
      "evidence_reasoning",
    ],
    supportedQuestionTypes: [
      "self_explanation",
      "error_analysis",
      "compare_two_solutions",
      "transfer_challenge",
      "metacognitive_reflection",
      "retrieval_check",
    ],
    supportedReasoningSkills: [
      "mental_model",
      "justification",
      "comparison",
      "error_detection",
      "transfer",
      "reflection",
    ],
    acceptedEvidenceSignals: [
      "explains reasoning in own words",
      "checks assumptions or constraints",
      "applies an idea to a new case",
    ],
    originalityModes: ["constrained_originality"],
    misconceptionFocus: [
      "shallow paraphrase",
      "guessing from keywords",
    ],
    challengeSequence: [
      "self_explanation",
      "error_analysis",
      "transfer_challenge",
      "metacognitive_reflection",
    ],
    teacherGuidance: [
      "Prefer reasoning over recitation.",
    ],
  }),
};

const SUBJECT_KEY_TO_PACKAGE: Record<string, SubjectPackageKey> = {
  math: "mathematics",
  mathematics: "mathematics",
  maths: "mathematics",
  mathematik: "mathematics",
  physics: "physics",
  physik: "physics",
  chemistry: "chemistry",
  chemie: "chemistry",
  biology: "biology",
  biologie: "biology",
  science: "general_science",
  naturwissenschaften: "general_science",
};

export function getSubjectPackage(subjectKey?: string | null) {
  const normalized = (subjectKey ?? "").trim().toLowerCase();
  const key = SUBJECT_KEY_TO_PACKAGE[normalized] ?? "general_science";
  return SUBJECT_PACKAGES[key];
}

export function getSubjectDisplayLabel(subjectKey?: string | null) {
  return getSubjectPackage(subjectKey).label;
}

export function listSubjectPackages() {
  return Object.values(SUBJECT_PACKAGES);
}

export function getDefaultChallengeSequence(subjectKey?: string | null) {
  return [...getSubjectPackage(subjectKey).challengeSequence];
}
