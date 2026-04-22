export function buildConflictDetectionPrompt(params: {
  framework: Record<string, unknown>;
  heuristics: Array<Record<string, unknown>>;
}) {
  return `Find conflicts between the expert framework and crystallized heuristics.

Framework:
${JSON.stringify(params.framework)}

Heuristics:
${JSON.stringify(params.heuristics)}

A conflict exists when:
- a heuristic instructs behavior the framework forbids
- a heuristic skips a required stage move
- a heuristic weakens the framework's stated teaching goal

Return only genuine conflicts.`;
}
