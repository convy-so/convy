type LearningEvalPresetCase = {
  caseKey: string;
  input: Record<string, unknown>;
  expectedOutput: Record<string, unknown>;
  tags: string[];
};

export type LearningEvalPreset = {
  key: string;
  datasetName: string;
  description: string;
  metadata: Record<string, unknown>;
  cases: LearningEvalPresetCase[];
};

export const learningEvalPresets: LearningEvalPreset[] = [
  {
    key: "math_kmk_sek1_reasoning",
    datasetName: "KMK Sek I Mathematics Reasoning Baseline",
    description:
      "Checks multiple valid strategies, transfer, and metacognitive coaching for Germany secondary mathematics.",
    metadata: {
      subjectKey: "mathematics",
      curriculumFrameworkKey: "kmk_de_sek1",
    },
    cases: [
      {
        caseKey: "math-multi-strategy-linear-equation",
        input: {
          outputText:
            "Start by trying one approach yourself: solve 3(x + 2) = 18 in a way that makes sense to you, and explain why each step keeps the equation balanced. After that, compare your method with another valid strategy, such as expanding first or dividing first.",
          scenario:
            "A student is learning linear equations and tends to memorize one procedure without justification.",
        },
        expectedOutput: {
          shouldEncourageAttemptFirst: true,
          shouldPreserveMultipleValidMethods: true,
        },
        tags: [
          "grade_band:secondary",
          "subject:mathematics",
          "concept_type:algebra",
          "difficulty_band:medium",
          "student_profile_signal:procedure_dependence",
          "reasoning_mode:self_explanation",
          "transfer_level:near",
        ],
      },
      {
        caseKey: "math-transfer-area-constraint-change",
        input: {
          outputText:
            "You already know how to find the area of a rectangle. Now imagine the perimeter stays fixed at 24 cm, but the side lengths can change. Which rectangles are possible, and how would you reason about which one gives the greatest area? Explain your thinking before calculating everything.",
          scenario:
            "A student can compute areas but struggles to transfer that knowledge to constrained optimization-style reasoning.",
        },
        expectedOutput: {
          shouldRequireTransfer: true,
          shouldRewardReasoningOverFinalAnswer: true,
        },
        tags: [
          "grade_band:secondary",
          "subject:mathematics",
          "concept_type:geometry",
          "difficulty_band:hard",
          "student_profile_signal:needs_transfer",
          "reasoning_mode:transfer_challenge",
          "transfer_level:far",
        ],
      },
    ],
  },
  {
    key: "physics_kmk_sek1_reasoning",
    datasetName: "KMK Sek I Physics Reasoning Baseline",
    description:
      "Checks model choice, assumptions, unit checking, and metacognitive feedback for Germany secondary physics.",
    metadata: {
      subjectKey: "physics",
      curriculumFrameworkKey: "kmk_de_sek1",
    },
    cases: [
      {
        caseKey: "physics-units-and-assumptions",
        input: {
          outputText:
            "Before using a formula, tell me what physical situation this is and what assumptions you are making. Then solve it and finish by checking whether your units make sense. If the units do not work out, stop and explain what that tells you.",
          scenario:
            "The student often jumps straight to formulas and skips unit checks in mechanics.",
        },
        expectedOutput: {
          shouldPromptModelSelection: true,
          shouldSurfaceUnitCheck: true,
        },
        tags: [
          "grade_band:secondary",
          "subject:physics",
          "concept_type:mechanics",
          "difficulty_band:medium",
          "student_profile_signal:skips_units",
          "reasoning_mode:error_analysis",
          "transfer_level:near",
        ],
      },
      {
        caseKey: "physics-data-model-comparison",
        input: {
          outputText:
            "Two students looked at the same motion graph and proposed different explanations. Compare both interpretations, decide which one fits the graph better, and point to the evidence in the graph that supports your choice. Then describe one mistake that could lead someone to choose the weaker explanation.",
          scenario:
            "A learner needs practice defending a model choice using evidence instead of intuition.",
        },
        expectedOutput: {
          shouldAskForComparison: true,
          shouldRequireEvidenceBackedReasoning: true,
        },
        tags: [
          "grade_band:secondary",
          "subject:physics",
          "concept_type:data_interpretation",
          "difficulty_band:hard",
          "student_profile_signal:model_confusion",
          "reasoning_mode:compare_two_solutions",
          "transfer_level:far",
        ],
      },
    ],
  },
  {
    key: "chemistry_kmk_sek1_reasoning",
    datasetName: "KMK Sek I Chemistry Reasoning Baseline",
    description:
      "Checks translation across representations, justified reactions, and misconception handling for Germany secondary chemistry.",
    metadata: {
      subjectKey: "chemistry",
      curriculumFrameworkKey: "kmk_de_sek1",
    },
    cases: [
      {
        caseKey: "chemistry-symbolic-conceptual-translation",
        input: {
          outputText:
            "Do not start with the balanced equation only. First describe what is happening at the particle level, then connect that to what someone would observe in the lab, and only then express it symbolically.",
          scenario:
            "The student can memorize chemical equations but struggles to connect symbolic, particulate, and observable levels.",
        },
        expectedOutput: {
          shouldBridgeRepresentations: true,
          shouldAvoidPureRecall: true,
        },
        tags: [
          "grade_band:secondary",
          "subject:chemistry",
          "concept_type:representation_translation",
          "difficulty_band:medium",
          "student_profile_signal:symbolic_only",
          "reasoning_mode:self_explanation",
          "transfer_level:near",
        ],
      },
      {
        caseKey: "chemistry-error-analysis-reaction",
        input: {
          outputText:
            "A classmate says mass decreases in a closed reaction because gas disappears. Analyze that reasoning, say what is wrong with it, and build a better explanation that uses conservation of mass and particle rearrangement.",
          scenario:
            "The student needs to diagnose a misconception and replace it with a justified chemistry explanation.",
        },
        expectedOutput: {
          shouldHandleMisconception: true,
          shouldRequireJustification: true,
        },
        tags: [
          "grade_band:secondary",
          "subject:chemistry",
          "concept_type:reaction_reasoning",
          "difficulty_band:hard",
          "student_profile_signal:mass_conservation_confusion",
          "reasoning_mode:error_analysis",
          "transfer_level:far",
        ],
      },
    ],
  },
  {
    key: "biology_kmk_sek1_reasoning",
    datasetName: "KMK Sek I Biology Reasoning Baseline",
    description:
      "Checks mechanism, systems reasoning, evidence-backed explanation, and transfer for Germany secondary biology.",
    metadata: {
      subjectKey: "biology",
      curriculumFrameworkKey: "kmk_de_sek1",
    },
    cases: [
      {
        caseKey: "biology-claim-evidence-reasoning",
        input: {
          outputText:
            "Make a claim about why the plant in the shade grew differently, then support it with evidence from the setup, and explain the biological mechanism that connects the evidence to your claim.",
          scenario:
            "The student gives short factual answers but does not build claim-evidence-reasoning explanations.",
        },
        expectedOutput: {
          shouldUseClaimEvidenceReasoning: true,
          shouldRequireMechanism: true,
        },
        tags: [
          "grade_band:secondary",
          "subject:biology",
          "concept_type:scientific_explanation",
          "difficulty_band:medium",
          "student_profile_signal:weak_justification",
          "reasoning_mode:self_explanation",
          "transfer_level:near",
        ],
      },
      {
        caseKey: "biology-system-transfer-ecosystem-change",
        input: {
          outputText:
            "A new predator enters the ecosystem. Predict two effects that might follow, explain the chain of reasoning behind each one, and say what additional evidence you would want before feeling confident.",
          scenario:
            "The learner needs systems reasoning and uncertainty handling rather than single-fact recall.",
        },
        expectedOutput: {
          shouldPromoteSystemsReasoning: true,
          shouldAcknowledgeUncertainty: true,
        },
        tags: [
          "grade_band:secondary",
          "subject:biology",
          "concept_type:systems_reasoning",
          "difficulty_band:hard",
          "student_profile_signal:single_step_thinking",
          "reasoning_mode:transfer_challenge",
          "transfer_level:far",
        ],
      },
    ],
  },
];
