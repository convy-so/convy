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
