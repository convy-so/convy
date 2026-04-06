import type { CoreAiFeature } from "@/lib/ai/observability";

export type EvalDimensionDefinition = {
  key: string;
  label: string;
  description: string;
  weight: number;
  passFloor: number;
};

export type EvalFeatureBlueprint = {
  feature: CoreAiFeature;
  rubricSetVersion: string;
  targetPassRate: number;
  releaseBlockerFloor: number;
  requiredTags: string[];
  dimensions: EvalDimensionDefinition[];
  guidance: string[];
};

const tutoringBlueprint: EvalFeatureBlueprint = {
  feature: "tutoring_chat",
  rubricSetVersion: "edu-tutoring-v1",
  targetPassRate: 0.9,
  releaseBlockerFloor: 0.78,
  requiredTags: [
    "grade_band",
    "subject",
    "concept_type",
    "difficulty_band",
    "student_profile_signal",
  ],
  dimensions: [
    {
      key: "grounding_accuracy",
      label: "Grounding Accuracy",
      description:
        "Factual claims stay within teacher-approved material and do not invent content.",
      weight: 0.22,
      passFloor: 0.9,
    },
    {
      key: "instructional_quality",
      label: "Instructional Quality",
      description:
        "The response helps the learner build a usable mental model, not just a correct answer.",
      weight: 0.2,
      passFloor: 0.8,
    },
    {
      key: "misconception_handling",
      label: "Misconception Handling",
      description:
        "Likely misconceptions are addressed clearly and gently without reinforcing the wrong model.",
      weight: 0.14,
      passFloor: 0.75,
    },
    {
      key: "personalization_fit",
      label: "Personalization Fit",
      description:
        "Student interests and playbook cues are used to support understanding rather than distract from it.",
      weight: 0.12,
      passFloor: 0.7,
    },
    {
      key: "age_appropriateness",
      label: "Age Appropriateness",
      description:
        "Language, tone, and challenge level are appropriate for the learner's grade band.",
      weight: 0.1,
      passFloor: 0.8,
    },
    {
      key: "engagement_without_noise",
      label: "Engagement Without Noise",
      description:
        "The tutor is warm and human but stays focused on learning rather than entertainment.",
      weight: 0.08,
      passFloor: 0.7,
    },
    {
      key: "next_step_quality",
      label: "Next Step Quality",
      description:
        "Checks, follow-up questions, or homework are diagnostic and educationally useful.",
      weight: 0.08,
      passFloor: 0.75,
    },
    {
      key: "teacher_visibility",
      label: "Teacher Visibility",
      description:
        "When the case matters for teacher follow-up, the output preserves a clear signal for reporting and review.",
      weight: 0.06,
      passFloor: 0.65,
    },
  ],
  guidance: [
    "Do not over-score charming but weak explanations.",
    "A tutoring answer fails if it is fluent but unsupported by source material.",
    "Prefer evidence of conceptual transfer over surface-level correctness.",
    "Personalization is positive only when it strengthens comprehension.",
  ],
};

const surveyBlueprint: EvalFeatureBlueprint = {
  feature: "survey_conducting",
  rubricSetVersion: "edu-conducting-v1",
  targetPassRate: 0.9,
  releaseBlockerFloor: 0.8,
  requiredTags: [
    "study_type",
    "participant_type",
    "node_type",
    "language",
    "fatigue_risk",
  ],
  dimensions: [
    {
      key: "coverage_progression",
      label: "Coverage Progression",
      description:
        "The interviewer moves the conversation toward required coverage without skipping essential nodes.",
      weight: 0.22,
      passFloor: 0.85,
    },
    {
      key: "question_quality",
      label: "Question Quality",
      description:
        "Questions are concrete, singular, and likely to elicit usable evidence rather than vague opinion.",
      weight: 0.18,
      passFloor: 0.8,
    },
    {
      key: "participant_comfort",
      label: "Participant Comfort",
      description:
        "Tone is respectful, non-leading, and psychologically safe for education research participants.",
      weight: 0.14,
      passFloor: 0.8,
    },
    {
      key: "non_leading_behavior",
      label: "Non-Leading Behavior",
      description:
        "The interviewer avoids implying preferred answers or collapsing options prematurely.",
      weight: 0.14,
      passFloor: 0.85,
    },
    {
      key: "probe_utility",
      label: "Probe Utility",
      description:
        "Follow-up probes deepen the evidence rather than merely restating the previous question.",
      weight: 0.12,
      passFloor: 0.75,
    },
    {
      key: "fatigue_management",
      label: "Fatigue Management",
      description:
        "The interviewer adapts pace and closes gracefully when fatigue rises or coverage is sufficient.",
      weight: 0.1,
      passFloor: 0.7,
    },
    {
      key: "evidence_reliability",
      label: "Evidence Reliability",
      description:
        "The turn is likely to yield analyzable evidence with clear, attributable meaning.",
      weight: 0.1,
      passFloor: 0.75,
    },
  ],
  guidance: [
    "Do not confuse friendliness with good interviewing.",
    "A strong interview question should reduce ambiguity and increase evidence value.",
    "Coverage matters, but coercive or leading coverage is a failure.",
    "Reward strategic stopping when the participant is done and required coverage is already met.",
  ],
};

const blueprints: Record<CoreAiFeature, EvalFeatureBlueprint | null> = {
  survey_creation: null,
  survey_conducting: surveyBlueprint,
  survey_analytics: null,
  survey_refinement: null,
  tutoring_chat: tutoringBlueprint,
  tutoring_voice: tutoringBlueprint,
  tutoring_media: null,
  memory_behavior: null,
};

export function getEvalBlueprint(feature: CoreAiFeature) {
  return blueprints[feature];
}

export function buildFeatureRubric(feature: CoreAiFeature) {
  const blueprint = getEvalBlueprint(feature);
  if (!blueprint) return {};

  return {
    rubricSetVersion: blueprint.rubricSetVersion,
    targetPassRate: blueprint.targetPassRate,
    releaseBlockerFloor: blueprint.releaseBlockerFloor,
    requiredTags: blueprint.requiredTags,
    judgeGuidance: blueprint.guidance,
    dimensions: blueprint.dimensions.map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      description: dimension.description,
      weight: dimension.weight,
      passFloor: dimension.passFloor,
    })),
  };
}

export function validateEvalCaseForFeature(params: {
  feature: CoreAiFeature;
  tags?: string[];
  rubric?: Record<string, unknown>;
}) {
  const blueprint = getEvalBlueprint(params.feature);
  if (!blueprint) {
    return {
      valid: true,
      missingTags: [] as string[],
      missingDimensions: [] as string[],
    };
  }

  const tags = new Set(params.tags ?? []);
  const rubricDimensions = Array.isArray(params.rubric?.dimensions)
    ? params.rubric.dimensions
        .flatMap((item) =>
          typeof item === "object" && item !== null && typeof (item as { key?: unknown }).key === "string"
            ? [(item as { key: string }).key]
            : [],
        )
    : [];

  const rubricKeys = new Set(rubricDimensions);
  const missingTags = blueprint.requiredTags.filter((tag) => !tags.has(tag));
  const missingDimensions = blueprint.dimensions
    .map((dimension) => dimension.key)
    .filter((key) => !rubricKeys.has(key));

  return {
    valid: missingTags.length === 0 && missingDimensions.length === 0,
    missingTags,
    missingDimensions,
  };
}
