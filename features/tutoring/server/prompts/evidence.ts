import {
  buildPromptFrame,
  renderTaggedSection,
  renderTeacherEvidenceBlocks,
} from "@/features/tutoring/server/prompt-serializers";

export function buildTeacherEvidenceAnswerPrompt(input: {
  language: string;
  studentName: string;
  question: string;
  retrievedEvidence: Array<{
    sourceType: string;
    sourceId: string;
    score?: number;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
  uniqueReports: Array<{
    lessonTitle: string | null;
    masteryPercent: number | null;
    report: unknown;
  }>;
  uniqueInteractions: Array<{
    lessonTitle: string | null;
    role: string;
    interactionType: string;
    content: string;
  }>;
}) {
  const evidence = renderTeacherEvidenceBlocks({
    retrievedEvidence: input.retrievedEvidence,
    uniqueReports: input.uniqueReports,
    uniqueInteractions: input.uniqueInteractions,
  });

  return [
    buildPromptFrame({
      role: `Answer a teacher's question about a student's learning trajectory in ${input.language}.`,
      goal: `Help the teacher understand ${input.studentName}'s development using only the supplied evidence.`,
      constraints: [
        "Answer only from the supplied evidence blocks.",
        "Prioritize relevance over recency.",
        "Be candid when the evidence is weak, partial, or contradictory.",
        "Focus on understanding, struggle, patterns, and next instructional meaning rather than just correctness.",
      ],
      antiRules: [
        "Do not invent evidence.",
        "Do not hide uncertainty.",
        "Do not mention internal retrieval systems or embeddings.",
      ],
      outputContract: [
        "Return structured fields only.",
        "Keep evidenceHighlights limited to the strongest directly relevant signals.",
        "When possible, include source labels such as report:<id> or interaction:<id> inside evidenceHighlights.",
      ],
    }),
    renderTaggedSection("teacher_question", `Student: ${input.studentName}\nQuestion: ${input.question}`),
    renderTaggedSection("primary_evidence", evidence.primary),
    renderTaggedSection("recent_reports_fallback", evidence.reports),
    renderTaggedSection("recent_interactions_fallback", evidence.interactions),
  ]
    .filter(Boolean)
    .join("\n\n");
}

