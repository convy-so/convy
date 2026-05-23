export function getSubjectDisplayLabel(subjectKey?: string | null) {
  if (!subjectKey) return "General";
  return subjectKey
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
