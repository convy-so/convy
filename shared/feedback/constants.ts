export const FEEDBACK_ROLE_VALUES = ["teacher", "student", "expert"] as const;

export const FEEDBACK_KIND_VALUES = ["complaint", "suggestion"] as const;

export const FEEDBACK_SOURCE_AREA_VALUES = [
  "platform",
  "survey",
  "tutoring",
  "classroom",
  "expert_ops",
  "other",
] as const;

export const FEEDBACK_STATUS_VALUES = ["open"] as const;

export const FEEDBACK_DEFAULTS = {
  statusOpen: FEEDBACK_STATUS_VALUES[0],
  defaultFallbackRole: FEEDBACK_ROLE_VALUES[0],
} as const;
