import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/shared/db";
import {
  learningEvidenceEmbeddings,
  learningInteractions,
  studentProgressReports,
} from "@/shared/db/schema";

import {
  indexLearningInteractionEvidence,
  indexLearningReportEvidence,
} from "./indexing";

export async function hydrateStudentLearningEvidence(params: {
  classroomStudentId: string;
  studentUserId?: string | null;
}) {
  const [reports, interactions] = await Promise.all([
    getDb().query.studentProgressReports.findMany({
      where: eq(studentProgressReports.classroomStudentId, params.classroomStudentId),
      with: { topic: { with: { classroom: true } } },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 12,
    }),
    getDb().query.learningInteractions.findMany({
      where: eq(learningInteractions.classroomStudentId, params.classroomStudentId),
      with: { topic: { with: { classroom: true } } },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 40,
    }),
  ]);

  const reportIds = reports.map((report) => report.id);
  const interactionIds = interactions.map((interaction) => interaction.id);

  const [existingReportEmbs, existingInteractionEmbs] = await Promise.all([
    reportIds.length > 0
      ? getDb().query.learningEvidenceEmbeddings.findMany({
          where: and(
            eq(learningEvidenceEmbeddings.classroomStudentId, params.classroomStudentId),
            eq(learningEvidenceEmbeddings.sourceType, "report"),
            inArray(learningEvidenceEmbeddings.sourceId, reportIds),
          ),
        })
      : Promise.resolve([]),
    interactionIds.length > 0
      ? getDb().query.learningEvidenceEmbeddings.findMany({
          where: and(
            eq(learningEvidenceEmbeddings.classroomStudentId, params.classroomStudentId),
            eq(learningEvidenceEmbeddings.sourceType, "interaction"),
            inArray(learningEvidenceEmbeddings.sourceId, interactionIds),
          ),
        })
      : Promise.resolve([]),
  ]);

  const latestIndexedAt = new Map<string, Date>();

  for (const embedding of [...existingReportEmbs, ...existingInteractionEmbs]) {
    const key = `${embedding.sourceType}:${embedding.sourceId}`;
    const candidate = embedding.sourceUpdatedAt ?? embedding.updatedAt;
    const current = latestIndexedAt.get(key);
    if (!current || candidate > current) {
      latestIndexedAt.set(key, candidate);
    }
  }

  for (const report of reports) {
    const sourceUpdatedAt = report.updatedAt ?? report.createdAt;
    const indexedAt = latestIndexedAt.get(`report:${report.id}`);
    if (indexedAt && indexedAt.getTime() >= sourceUpdatedAt.getTime()) {
      continue;
    }

    await indexLearningReportEvidence({
      reportId: report.id,
      classroomStudentId: report.classroomStudentId,
      studentUserId: params.studentUserId ?? null,
      topicId: report.topicId,
      classroomId: report.topic?.classroomId ?? null,
      topicTitle: report.topic?.title ?? null,
      language: report.sourceLocale,
      subjectKey: report.topic?.courseId ?? null,
      gradeBand: report.topic?.classroom.gradeBand ?? null,
      masteryPercent: report.masteryPercent,
      report: report.report as Record<string, unknown>,
      sourceUpdatedAt,
    });
  }

  for (const interaction of interactions) {
    const sourceUpdatedAt = interaction.updatedAt ?? interaction.createdAt;
    const indexedAt = latestIndexedAt.get(`interaction:${interaction.id}`);
    if (indexedAt && indexedAt.getTime() >= sourceUpdatedAt.getTime()) {
      continue;
    }

    await indexLearningInteractionEvidence({
      interactionId: interaction.id,
      classroomStudentId: interaction.classroomStudentId,
      studentUserId: params.studentUserId ?? null,
      topicId: interaction.topicId ?? null,
      classroomId: interaction.topic?.classroomId ?? null,
      topicTitle: interaction.topic?.title ?? null,
      language: interaction.topic?.contentLocale ?? "en",
      subjectKey: interaction.topic?.courseId ?? null,
      gradeBand: interaction.topic?.classroom.gradeBand ?? null,
      interactionType: interaction.interactionType,
      role: interaction.role,
      content: interaction.content,
      phaseType: interaction.phaseType ?? null,
      conceptKey: interaction.conceptKey ?? null,
      metadata: interaction.metadata as Record<string, unknown>,
      sourceUpdatedAt,
    });
  }
}
