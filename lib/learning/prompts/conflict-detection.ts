import { buildPromptFrame, renderTaggedSection } from "@/lib/learning/prompt-serializers";

export function buildConflictDetectionPrompt(params: {
  framework: Record<string, unknown>;
  heuristics: Array<Record<string, unknown>>;
}) {
  const frameworkText = Object.entries(params.framework)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : String(value)}`)
    .join("\n");
  const heuristicsText = params.heuristics
    .map((heuristic, index) =>
      `${index + 1}. ${Object.entries(heuristic)
        .map(([key, value]) => `${key}=${typeof value === "string" ? value : String(value)}`)
        .join(" | ")}`,
    )
    .join("\n");

  return [
    buildPromptFrame({
      role: "Find conflicts between the expert framework and crystallized heuristics.",
      goal: "Identify only real policy or pedagogical conflicts.",
      constraints: [
        "A conflict exists when a heuristic instructs behavior the framework forbids.",
        "A conflict exists when a heuristic skips a required stage move.",
        "A conflict exists when a heuristic weakens the framework's stated teaching goal.",
      ],
      outputContract: ["Return only genuine conflicts."],
    }),
    renderTaggedSection("framework", frameworkText || "none"),
    renderTaggedSection("heuristics", heuristicsText || "none"),
  ]
    .filter(Boolean)
    .join("\n\n");
}
