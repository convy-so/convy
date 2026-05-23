export type TutorCapability = {
  id: string;
  label: string;
  summary: string;
  placeholder: string;
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
    label: "Grading & feedback",
    summary:
      "Score quiz answers and show structured feedback with a mastery level.",
    placeholder:
      "How should feedback sound? What mastery bar should count as success?",
  },
];

const capabilityById = new Map(
  TUTOR_CAPABILITIES.map((capability) => [capability.id, capability]),
);

export function getTutorCapability(id: string): TutorCapability | undefined {
  return capabilityById.get(id);
}

export function normalizeFunctionalityGuidance(
  guidance: Record<string, string> | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {};
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

/** Migrate legacy single-field guidance into per-capability storage. */
export function coerceFunctionalityGuidance(input: {
  functionalityGuidance?: Record<string, string>;
  toolUseGuidance?: string;
}): Record<string, string> {
  const fromRecord = normalizeFunctionalityGuidance(input.functionalityGuidance);
  if (Object.keys(fromRecord).length > 0) {
    return fromRecord;
  }
  const legacy = input.toolUseGuidance?.trim();
  if (!legacy) {
    return {};
  }
  // Legacy tool-use guidance targeted live material search; grounding is now session-pack based.
  return {};
}
