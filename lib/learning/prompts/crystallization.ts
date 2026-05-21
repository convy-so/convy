export function buildCrystallizationPrompt(params: {
  reviewCases: Array<Record<string, unknown>>;
  framework: Record<string, unknown>;
  scope: "general" | "framework_specific";
}) {
  const scopeInstruction = params.scope === "general"
    ? "Focus on universal pedagogical principles that apply regardless of the specific framework. Avoid mentioning specific framework details unless they are fundamental concepts."
    : "Focus on improving the specific framework provided. You may reference specific framework details and objectives to create precise patches for the current framework structure.";

  return `Crystallize reusable pedagogical knowledge from these expert-reviewed tutoring cases.

SCOPE: ${params.scope.toUpperCase()}
${scopeInstruction}

Framework:
${JSON.stringify(params.framework)}

Review cases:
${JSON.stringify(params.reviewCases)}

Return reusable heuristics only when they generalize beyond one transcript.
Each heuristic should state:
- trigger
- action
- rationale
- examples`;
}
