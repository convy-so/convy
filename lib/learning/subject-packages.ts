export function getSubjectDisplayLabel(subjectKey?: string | null) {
  if (!subjectKey) return "General";
  const normalized = subjectKey.trim().toLowerCase();
  const known: Record<string, string> = {
    mathematics: "Mathematics",
    physics: "Physics",
    chemistry: "Chemistry",
    biology: "Biology",
    general_science: "General Science",
    general: "General",
  };
  return (
    known[normalized] ??
    subjectKey
      .split(/[_-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}
