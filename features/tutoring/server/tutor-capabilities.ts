export const TUTOR_CAPABILITY_IDS = [
  "search_image",
  "search_video",
  "administer_quiz",
  "grade_student_work",
  "finish_session",
] as const;

export type TutorCapabilityId = (typeof TUTOR_CAPABILITY_IDS)[number];
export const TOGGLEABLE_TUTOR_CAPABILITY_IDS = [
  "search_image",
  "search_video",
  "administer_quiz",
  "grade_student_work",
] as const;

export type ToggleableTutorCapabilityId =
  (typeof TOGGLEABLE_TUTOR_CAPABILITY_IDS)[number];

export const IMAGE_SEARCH_MAX_CALLS_PER_TURN = 5;
export const VIDEO_SEARCH_MAX_CALLS_PER_TURN = 2;

export type TutorCapability = {
  id: TutorCapabilityId;
  label: string;
  summary: string;
  placeholder: string;
  hasEnabledToggle: boolean;
  maxUsesCap?: number;
};

export const TUTOR_CAPABILITIES: TutorCapability[] = [
  {
    id: "search_image",
    label: "Educational images",
    summary:
      "Choose whether image search is available, define the policy for using it, and set the per-response limit.",
    placeholder:
      "State exactly when image search is allowed, what it should help with, and when the tutor should avoid it.",
    hasEnabledToggle: true,
    maxUsesCap: IMAGE_SEARCH_MAX_CALLS_PER_TURN,
  },
  {
    id: "search_video",
    label: "Educational videos",
    summary:
      "Choose whether video search is available, define the policy for using it, and set the per-response limit.",
    placeholder:
      "State when video search is allowed, what kind of explainer it should find, and when the tutor should stay with text or images.",
    hasEnabledToggle: true,
    maxUsesCap: VIDEO_SEARCH_MAX_CALLS_PER_TURN,
  },
  {
    id: "administer_quiz",
    label: "Quizzes",
    summary:
      "Choose whether the tutor can issue a formal quiz card and define the policy for when to use it.",
    placeholder:
      "State when the tutor should use a quiz instead of a conversational check and what a valid quiz moment looks like.",
    hasEnabledToggle: true,
  },
  {
    id: "grade_student_work",
    label: "Grading and feedback",
    summary:
      "Choose whether the tutor can grade submitted quiz work and define the policy for scoring and feedback.",
    placeholder:
      "State when grading is allowed, what evidence it must rely on, and what standard the tutor should apply.",
    hasEnabledToggle: true,
  },
  {
    id: "finish_session",
    label: "Finish session",
    summary:
      "Define the completion policy for the always-available finish-session tool.",
    placeholder:
      "State what completion evidence is required before ending the session and what the closing note must accomplish.",
    hasEnabledToggle: false,
  },
];

const capabilityById = new Map(
  TUTOR_CAPABILITIES.map((capability) => [capability.id, capability]),
);

export function getTutorCapability(id: string): TutorCapability | undefined {
  return capabilityById.get(id as TutorCapabilityId);
}
