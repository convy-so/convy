export function buildCrystallizationPrompt(params: {
  reviewCases: Array<Record<string, unknown>>;
  framework: Record<string, unknown>;
}) {
  return `Crystallize reusable pedagogical knowledge from these expert-reviewed tutoring cases.

Framework:
${JSON.stringify(params.framework)}

Review cases:
${JSON.stringify(params.reviewCases)}

Return reusable heuristics only when they generalize beyond one transcript.
Each heuristic should state:
- trigger
- action
- rationale
- examples
- likely stage relevance`;
}
