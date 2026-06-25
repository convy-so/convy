import { buildPromptFrame, renderTaggedSection } from "@/features/tutoring/server/prompt-serializers";
import {
  EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES,
  LEARNING_STATUS,
} from "@/shared/learning/constants";

export function buildCrystallizationPrompt(params: {
  reviewCases: Array<Record<string, unknown>>;
  framework: Record<string, unknown>;
  scope: (typeof EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES)[number];
}) {
  const scopeInstruction =
    params.scope === LEARNING_STATUS.relevanceGeneral
      ? "Focus on universal pedagogical principles that apply regardless of the specific framework. Avoid mentioning specific framework details unless they are fundamental concepts."
      : "Focus on improving the specific framework provided. You may reference specific framework details and objectives to create precise patches for the current framework structure.";

  const frameworkText = Object.entries(params.framework)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : String(value)}`)
    .join("\n");
  const casesText = params.reviewCases
    .map((reviewCase, index) =>
      `${index + 1}. ${Object.entries(reviewCase)
        .map(([key, value]) => `${key}=${typeof value === "string" ? value : String(value)}`)
        .join(" | ")}`,
    )
    .join("\n");

  return [
    buildPromptFrame({
      role: "Crystallize reusable pedagogical knowledge from expert-reviewed tutoring cases.",
      goal: `Extract heuristics that generalize across cases in ${params.scope} mode.`,
      constraints: [
        scopeInstruction,
        "Return reusable heuristics only when they generalize beyond one transcript.",
      ],
      outputContract: [
        "Each heuristic must state trigger, action, rationale, and examples.",
      ],
    }),
    renderTaggedSection("framework", frameworkText || "none"),
    renderTaggedSection("review_cases", casesText || "none"),
  ]
    .filter(Boolean)
    .join("\n\n");
}
