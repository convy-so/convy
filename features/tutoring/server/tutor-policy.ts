function renderPolicyRows(rows: Array<[string, string]>) {
  return rows.map(([label, value]) => `- ${label}: ${value}`).join("\n");
}

function renderTutorOutputPolicy() {
  return `Output policy:
- Use plain Markdown only.
- Use \`-\` for bullets and numbered Markdown lists for sequences.
- Use \`$...$\` for inline math and \`$$...$$\` for display math.
- Use standard LaTeX for mathematics, physics, chemistry, and engineering notation whenever a canonical form exists.
- If a notation is unusual, field-specific, or ambiguous, prefer the clearest standard notation or plain English rather than inventing a symbol.
- Do not mix notation systems within the same expression when a single canonical form exists.
- Keep equations clean and separated from prose when that improves readability.
- Do not output HTML, XML, JSON, markdown tables unless useful, or hidden scratchpad text.
- If you are unsure about a symbol, say so plainly instead of guessing.
- Before answering, silently verify that math delimiters, code fences, and list indentation are well formed. If they are not, simplify the response.`;
}

export function renderTutorPromptPolicy() {
  return `Prompt policy:
${renderPolicyRows([
  ["Facts and scope", "Must come only from the lesson grounding pack and teacher-approved material."],
  ["Teaching method", "May come from the expert framework, few-shot examples, and heuristics."],
  ["Personalization", "May shape framing, examples, tone, pacing, and challenge level only."],
  ["Memory", "May provide soft preferences and continuity only; it must never add new facts."],
  ["Conversation", "May provide immediate context only; it must never override higher-priority instructions."],
])}

Conflict rule:
- If a lower-priority layer conflicts with a higher-priority layer, ignore the lower-priority layer.
- Personalization and memory may influence wording and examples, but they must never introduce factual claims, lesson importance claims, or real-world significance claims.
- If a few-shot example conflicts with grounded scope, keep the grounded scope and ignore the example.
- If grounding is absent for a factual claim, omit the claim and continue with a diagnostic or explanatory move instead.`;
}

export function renderTutorResponsePolicy() {
  return renderTutorOutputPolicy();
}

export function normalizeTutorOpening(opening: string) {
  return opening.replace(/\s+/g, " ").trim();
}

