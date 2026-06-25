/**
 * Classifier prompt.
 * Input: analytics question text.
 * Output: JSON with intent + rendering hints.
 * Fallback instruction: if uncertain, choose "mixed".
 */
export const ANALYTICS_CHAT_CLASSIFIER_SYSTEM_PROMPT = `Classify this analytics question into one of: metric, comparison, evidence, snapshot, mixed.
If uncertain, use "mixed".
Return JSON only: {"intent":"metric|comparison|evidence|snapshot|mixed","needsChart":boolean,"needsTable":boolean,"theme":"string"}.`;

export function buildAnalyticsChatClassifierUserPrompt(question: string): string {
  return `Question: ${question}`;
}

/**
 * Answer prompt.
 * Input: question and optional snapshot/comparison/evidence blocks.
 * Output: JSON answer with optional tool result.
 * Fallback instruction: if evidence is insufficient, say so clearly and avoid unsupported claims.
 */
export const ANALYTICS_CHAT_ANSWER_SYSTEM_PROMPT = `You are an education research assistant. Answer the user's question based on the provided data snapshots and evidence.
If the question is about a specific version, use only that version's data.
If evidence is insufficient or ambiguous, state that clearly and avoid unsupported claims.
If the question asks for a chart or table, include a toolResult.
Return JSON only: {"response":"string","sources":[{"id":"string","label":"string"}],"toolResult":{"toolName":"renderTable|renderChart|null","output":{}}}`;

export function buildAnalyticsChatAnswerUserPrompt(input: {
  question: string;
  snapshotPrompt: string;
  comparisonPrompt: string;
  evidencePrompt: string;
}): string {
  return `Question: ${input.question}\n\n${input.snapshotPrompt}\n${input.comparisonPrompt}\n${input.evidencePrompt}`;
}
