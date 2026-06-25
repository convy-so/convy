import { renderUntrustedContextBlock } from "@/shared/ai/scope-policy";

export const TOPIC_GROUNDING_PACK_MAX_INPUT_CHARS = 96_000;

export function buildTopicGroundingPackPrompt(input: {
  topicTitle: string;
  topicDescription?: string | null;
  teacherSummary: string;
  learningOutcomes: Array<{ title: string; description: string }>;
  compiledGroundingText: string;
  existingScopeNotes: string[];
  existingNotationNotes: string[];
  existingRigorNotes: string[];
}): string {
  const outcomes = input.learningOutcomes
    .map((outcome, index) => `${index + 1}. ${outcome.title}: ${outcome.description}`)
    .join("\n");

  return `You are compiling a Topic Grounding Pack for a bounded tutoring session.

The pack is the authoritative teaching corpus for this topic. A live tutor will load it once at session start and must NOT rely on searching documents during chat.

Topic: ${input.topicTitle}
Description: ${input.topicDescription ?? "(none)"}
Teacher summary: ${input.teacherSummary || "(none)"}

Learning outcomes:
${outcomes || "(none)"}

Existing boundary notes (merge and deduplicate; do not drop):
- Scope: ${input.existingScopeNotes.join("; ") || "(none)"}
- Notation: ${input.existingNotationNotes.join("; ") || "(none)"}
- Rigor: ${input.existingRigorNotes.join("; ") || "(none)"}

Compiled grounding from teacher uploads (already extracted and normalized; use as the authoritative source corpus for pack compilation):
${renderUntrustedContextBlock("teacher_source_grounding", input.compiledGroundingText)}

Extract a structured pack:
1. digest — 2–4 paragraphs: what this topic covers, how ideas connect, and how tutoring should stay grounded.
2. sections — logical teaching sections (not file names). Each needs title, summary, and keyPoints bullets.
3. inScopeConcepts — named concepts the tutor may teach with one-line summaries.
4. explicitlyOutOfScope — topics the material excludes or that must not be introduced.
5. formulas — every formula, equation, definition, or rule students must use exactly as taught. Include label, expression (LaTeX or plain text), conditions, usageNotes. This list is used to prevent hallucinated math/science notation.
6. notationRules, rigorRules, scopeRules — concise bullet rules.
7. teachingNotes — pedagogy hints implied by the material (common mistakes, order of ideas, what to probe first).

Rules:
- Ground only in the compiled grounding and outcomes. If uncertain, omit rather than invent.
- Do not mention PDFs, slides, filenames, or upload formats.
- Prefer completeness for formulas and scope boundaries over narrative length.
- Section titles should be student-facing topic names, not document names.`;
}
