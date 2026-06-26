import { generateStructuredOutput } from "@/shared/ai/model-generation";
import { getDb } from "@/shared/db";
import { buildTeacherEvidenceAnswerPrompt } from "@/features/tutoring/server/prompts/evidence";

import { searchStudentEvidenceContext } from "./retrieval";
import { teacherEvidenceAnswerSchema } from "./evidence-domain";

export async function answerTeacherStudentQuestion(params: {
  classroomStudentId: string;
  studentUserId?: string | null;
  studentName: string;
  question: string;
  language: string;
}) {
  const [reports, interactions, retrievedEvidence] = await Promise.all([
    getDb().query.studentLessonReports.findMany({
      where: (table, { eq }) => eq(table.classroomStudentId, params.classroomStudentId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 4,
      with: { lesson: true },
    }),
    getDb().query.studentInteractions.findMany({
      where: (table, { eq }) => eq(table.classroomStudentId, params.classroomStudentId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 8,
      with: { lesson: true },
    }),
    searchStudentEvidenceContext({
      classroomStudentId: params.classroomStudentId,
      query: params.question,
      language: params.language,
      limit: 8,
    }),
  ]);

  const ragSourceIds = new Set(retrievedEvidence.map((item) => item.sourceId));
  const uniqueReports = reports.filter((report) => !ragSourceIds.has(report.id));
  const uniqueInteractions = interactions.filter(
    (interaction) => !ragSourceIds.has(interaction.id),
  );

  return await generateStructuredOutput({
    schema: teacherEvidenceAnswerSchema,
    prompt: buildTeacherEvidenceAnswerPrompt({
      language: params.language,
      studentName: params.studentName,
      question: params.question,
      retrievedEvidence: retrievedEvidence.map((item) => ({
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        score: item.score,
        content: item.content,
        metadata: item.metadata,
      })),
      uniqueReports: uniqueReports.map((report) => ({
        lessonTitle: report.lesson?.title ?? null,
        masteryPercent: report.masteryPercent,
        report: report.report,
      })),
      uniqueInteractions: uniqueInteractions.map((interaction) => ({
        lessonTitle: interaction.lesson?.title ?? null,
        role: interaction.role,
        interactionType: interaction.interactionType,
        content: interaction.content,
      })),
    }),
  });
}

