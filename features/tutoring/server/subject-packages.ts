import { LEARNING_SUBJECT_DEFAULTS } from "@/shared/learning/constants";

export function getSubjectDisplayLabel(subjectKey?: string | null) {
  if (!subjectKey) return LEARNING_SUBJECT_DEFAULTS.label;
  return subjectKey
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
