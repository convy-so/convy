export const TUTOR_CAPABILITY_IDS = [
  "search_image",
  "search_video",
  "administer_quiz",
  "grade_student_work",
  "finish_session",
] as const;

export type TutorCapabilityId = (typeof TUTOR_CAPABILITY_IDS)[number];
export type TutorCapabilityGuidance = Record<TutorCapabilityId, string>;

export type TutorCapability = {
  id: TutorCapabilityId;
  label: string;
  summary: string;
  placeholder: string;
};

export const EMPTY_TUTOR_CAPABILITY_GUIDANCE: TutorCapabilityGuidance = {
  search_image: "",
  search_video: "",
  administer_quiz: "",
  grade_student_work: "",
  finish_session: "",
};

export const TUTOR_CAPABILITIES: TutorCapability[] = [
  {
    id: "search_image",
    label: "Educational images",
    summary:
      "Show diagrams, photographs, or illustrations when a concept has a meaningful visual form.",
    placeholder:
      "Which topics benefit from images? When should the tutor avoid showing one?",
  },
  {
    id: "search_video",
    label: "Educational videos",
    summary:
      "Show explainer videos for multi-step processes, experiments, or dynamic systems.",
    placeholder:
      "When is a video more helpful than text or an image? Any pacing limits?",
  },
  {
    id: "administer_quiz",
    label: "Quizzes",
    summary:
      "Ask formal quiz questions with an interactive quiz card in the chat.",
    placeholder:
      "When should the tutor quiz vs. use conversational checks? Notebook upload expectations?",
  },
  {
    id: "grade_student_work",
    label: "Grading and feedback",
    summary:
      "Score quiz answers and show structured feedback with a mastery level.",
    placeholder:
      "How should feedback sound? What mastery bar should count as success?",
  },
  {
    id: "finish_session",
    label: "Finish session",
    summary:
      "End the session only when the tutor can cite clear completion evidence and next steps.",
    placeholder:
      "What evidence should the tutor collect before finishing? What closing note should the student receive?",
  },
];

const capabilityById = new Map(
  TUTOR_CAPABILITIES.map((capability) => [capability.id, capability]),
);

export function getTutorCapability(id: string): TutorCapability | undefined {
  return capabilityById.get(id as TutorCapabilityId);
}

export function createEmptyCapabilityGuidance(): TutorCapabilityGuidance {
  return { ...EMPTY_TUTOR_CAPABILITY_GUIDANCE };
}

export function normalizeCapabilityGuidance(
  guidance: Record<string, string> | undefined,
): TutorCapabilityGuidance {
  const normalized = createEmptyCapabilityGuidance();

  for (const capability of TUTOR_CAPABILITIES) {
    normalized[capability.id] = guidance?.[capability.id]?.trim() ?? "";
  }

  return normalized;
}

export function getMissingCapabilityGuidance(
  guidance: Record<string, string> | undefined,
): TutorCapabilityId[] {
  const normalized = normalizeCapabilityGuidance(guidance);
  return TUTOR_CAPABILITY_IDS.filter((id) => normalized[id].trim().length === 0);
}

export function hasCompleteCapabilityGuidance(
  guidance: Record<string, string> | undefined,
) {
  return getMissingCapabilityGuidance(guidance).length === 0;
}

export function normalizeFunctionalityGuidance(
  guidance: Record<string, string> | undefined,
): Partial<TutorCapabilityGuidance> {
  const normalized: Partial<TutorCapabilityGuidance> = {};

  for (const capability of TUTOR_CAPABILITIES) {
    const value = guidance?.[capability.id]?.trim() ?? "";
    if (value) {
      normalized[capability.id] = value;
    }
  }

  return normalized;
}

export function formatFunctionalityGuidanceForPrompt(
  guidance: Record<string, string> | undefined,
): string {
  const lines: string[] = [];

  for (const capability of TUTOR_CAPABILITIES) {
    const value = guidance?.[capability.id]?.trim();
    if (value) {
      lines.push(`- ${capability.label}: ${value}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "";
}

/** Legacy single-field guidance is intentionally not copied into capability guidance. */
export function coerceFunctionalityGuidance(input: {
  functionalityGuidance?: Record<string, string>;
  toolUseGuidance?: string;
}): Partial<TutorCapabilityGuidance> {
  const fromRecord = normalizeFunctionalityGuidance(input.functionalityGuidance);
  if (Object.keys(fromRecord).length > 0) {
    return fromRecord;
  }

  void input.toolUseGuidance;
  return {};
}
