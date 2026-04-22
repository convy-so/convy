import { z } from "zod";

import { getDb } from "@/db";
import { learningInteractions, studentProgressReports } from "@/db/schema";
import { generateStructuredOutput } from "@/lib/ai/runtime";
import { searchLearningTopicContext } from "@/lib/learning/rag";

type EvidenceContextItem = {
  id: string;
  content: string;
  score: number;
  sourceType: "material";
  sourceId: string;
  metadata: Record<string, unknown>;
};

const teacherEvidenceAnswerSchema = z.object({
  answer: z.string(),
  evidenceHighlights: z.array(z.string()).default([]),
});

export async function indexLearningMaterialEvidence(_params: Record<string, unknown>) {
  return [];
}

export async function indexLearningInteractionEvidence(_params: Record<string, unknown>) {
  return [];
}

export async function indexLearningReportEvidence(_params: Record<string, unknown>) {
  return [];
}

export async function hydrateStudentLearningEvidence(_params: {
  classroomStudentId: string;
  studentUserId?: string | null;
}) {
  return;
}

export async function findLearningEvidenceContext(params: {
  topicId: string;
  query: string;
  language?: string;
  limit?: number;
}): Promise<EvidenceContextItem[]> {
  const results = await searchLearningTopicContext({
    topicId: params.topicId,
    query: params.query,
    contentLocale: params.language ?? "en",
    limit: params.limit ?? 6,
  });

  return results.map((result) => ({
    id: result.id,
    content: result.content,
    score: result.score,
    sourceType: "material",
    sourceId: result.sourceId ?? result.id,
    metadata: result.metadata ?? {},
  }));
}

export async function answerTeacherStudentQuestion(params: {
  classroomStudentId: string;
  studentUserId?: string | null;
  studentName: string;
  question: string;
  language: string;
}) {
  const [reports, interactions] = await Promise.all([
    getDb().query.studentProgressReports.findMany({
      where: (table, { eq }) => eq(table.classroomStudentId, params.classroomStudentId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 6,
      with: {
        topic: true,
      },
    }),
    getDb().query.learningInteractions.findMany({
      where: (table, { eq }) => eq(table.classroomStudentId, params.classroomStudentId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 16,
      with: {
        topic: true,
      },
    }),
  ]);

  return await generateStructuredOutput({
    schema: teacherEvidenceAnswerSchema,
    prompt: `Answer a teacher's question about a student's learning trajectory.

Reply in ${params.language}.

Student: ${params.studentName}
Question: ${params.question}

Recent reports:
${JSON.stringify(
      reports.map((report) => ({
        topicTitle: report.topic?.title ?? null,
        masteryPercent: report.masteryPercent,
        report: report.report,
      })),
    )}

Recent interactions:
${JSON.stringify(
      interactions.map((interaction) => ({
        topicTitle: interaction.topic?.title ?? null,
        role: interaction.role,
        interactionType: interaction.interactionType,
        content: interaction.content,
      })),
    )}

Rules:
- answer only from the supplied evidence
- be candid when evidence is insufficient
- focus on understanding, struggle, and development rather than just correctness`,
  });
}
