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
    topicTitle: string | null;
    masteryPercent: number | null;
    report: unknown;
  }>;
  uniqueInteractions: Array<{
    topicTitle: string | null;
    role: string;
    interactionType: string;
    content: string;
  }>;
}) {
  return `Answer a teacher's question about a student's learning trajectory.

Reply in ${input.language}.

Student: ${input.studentName}
Question: ${input.question}

Most relevant evidence:
${JSON.stringify(input.retrievedEvidence)}

Recent reports fallback (excluding exact matches above):
${JSON.stringify(input.uniqueReports)}

Recent interactions fallback (excluding exact matches above):
${JSON.stringify(input.uniqueInteractions)}

Rules:
- answer only from the supplied evidence
- prioritize the most relevant evidence over simple recency
- be candid when evidence is insufficient
- focus on understanding, struggle, and development rather than just correctness
- include evidenceHighlights only for the strongest directly relevant signals`;
}
