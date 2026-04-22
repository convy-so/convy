import type { GradeBand } from "@/lib/learning/types";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeGradeBand(input: string): GradeBand {
  const value = normalizeText(input);

  if (
    value.includes("nursery") ||
    value.includes("kindergarten") ||
    value.includes("pre-school") ||
    value.includes("preschool")
  ) {
    return "nursery";
  }

  if (value.includes("primary") || value.includes("elementary")) {
    return "primary";
  }

  if (
    value.includes("secondary") ||
    value.includes("high school") ||
    value.includes("middle school")
  ) {
    return "secondary";
  }

  return "university";
}
