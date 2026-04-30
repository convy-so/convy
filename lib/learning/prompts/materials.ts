import { renderUntrustedContextBlock } from "@/lib/ai/scope-policy";

export const MATERIAL_ANALYSIS_MAX_CHARS = 18_000;
export const MATERIAL_SUMMARY_MAX_CHARS = 16_000;

/**
 * Input: topic metadata + outcomes + source material.
 * Output: structured object (schema enforced by caller).
 * Fallback instruction: if material is insufficient, state uncertainty explicitly.
 */
export function buildMaterialAnalysisPrompt(input: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  materialText: string;
}): string {
  const outcomeLines = input.learningOutcomes
    .map((outcome, index) => `${index + 1}. ${outcome.title}: ${outcome.description}`)
    .join("\n");

  return `Topic: ${input.topicTitle}
Description: ${input.topicDescription ?? ""}
Learning outcomes:
${outcomeLines}

Material excerpt:
${renderUntrustedContextBlock("learning_material", input.materialText.slice(0, MATERIAL_ANALYSIS_MAX_CHARS))}

You are helping a teacher review whether the uploaded source material is sufficient for a tightly grounded tutor.
- Write a concise summary.
- Ask only necessary clarifying questions.
- Note where the material supports or fails to support the learning outcomes.
- Suggest outcome edits only when the outcomes are too vague or unsupported.
- Extract Rigor Notes: What is the academic level? What complexity of problems are present?
- Extract Notation Notes: What specific mathematical or scientific symbols, conventions, or units are used?
- Extract Scope Notes: What specific sub-topics are included or explicitly excluded? What are the boundaries of the content?
- If evidence is insufficient, state uncertainty clearly and do not invent details.`;
}

/**
 * Input: topic title + source material.
 * Output: plain-text bullet summary.
 * Fallback instruction: if evidence is thin, explicitly mark assumptions.
 */
export function buildMaterialGroundingSummaryPrompt(input: {
  topicTitle: string;
  materialText: string;
}): string {
  return `Summarize the learning boundaries for the topic "${input.topicTitle}" based only on the source material below in 6 bullet points or fewer.
If evidence is thin or ambiguous, clearly mark assumptions instead of presenting them as facts.

${renderUntrustedContextBlock("learning_material", input.materialText.slice(0, MATERIAL_SUMMARY_MAX_CHARS))}`;
}
