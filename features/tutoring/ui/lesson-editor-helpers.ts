import { requireValue } from "@/shared/utils/collections";

export type OutcomeDraft = {
  id: string;
  title: string;
  description: string;
  reviewNote: string | null;
};

export function toOutcomeDrafts(
  outcomes: Array<{
    id?: string;
    title: string;
    description: string;
  }>,
): OutcomeDraft[] {
  return outcomes.map((outcome, index) => ({
    id: outcome.id ?? `outcome-${index + 1}`,
    title: outcome.title,
    description: outcome.description,
    reviewNote: null,
  }));
}

export function toOutcomePayload(outcomes: OutcomeDraft[]) {
  return outcomes
    .map((outcome, index) => ({
      id: outcome.id || `outcome-${index + 1}`,
      title: outcome.title.trim(),
      description: outcome.description.trim(),
    }))
    .filter((outcome) => outcome.title && outcome.description);
}

export function formatOutcomesForNotes(
  outcomes: Array<{ title: string; description: string }>,
) {
  return outcomes
    .map((outcome, index) => {
      const title = outcome.title.trim();
      const description = outcome.description.trim();
      return `${index + 1}. ${title}${description && description !== title ? `: ${description}` : ""}`;
    })
    .join("\n");
}

export function parseOutcomeNotes(raw: string): OutcomeDraft[] {
  return raw
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^\d+[\.)]\s*/, "")
        .replace(/^[-*]\s*/, ""),
    )
    .filter(Boolean)
    .map((line, index) => {
      const [titlePart, ...descriptionParts] = line.split(":");
      const title = requireValue(
        titlePart,
        "Expected outcome title when parsing outcome notes",
      ).trim();
      const description = descriptionParts.join(":").trim() || title;

      return {
        id: `text-outcome-${index + 1}`,
        title,
        description,
        reviewNote: null,
      };
    });
}

export function formatAttemptStatus(attempt: {
  status: "queued" | "processing" | "succeeded" | "failed";
  stage: "upload" | "extraction" | "analysis" | "indexing" | "pack_build";
}) {
  const stageLabel =
    attempt.stage === "pack_build"
      ? "pack build"
      : attempt.stage === "analysis"
        ? "analysis"
        : attempt.stage;

  if (attempt.status === "failed") return `Failed during ${stageLabel}`;
  if (attempt.status === "succeeded") return "Processed";
  if (attempt.status === "queued") return `Queued for ${stageLabel}`;
  return `Processing: ${stageLabel}`;
}
