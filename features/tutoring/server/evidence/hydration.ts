import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/shared/db";
import {
  lessonEvidenceEmbeddings,
  studentInteractions,
  studentLessonReports,
} from "@/shared/db/schema";

import {
  indexStudentInteractionEvidence,
  indexStudentReportEvidence,
} from "./indexing";

export async function hydrateStudentLearningEvidence(params: {
  classroomStudentId: string;
  studentUserId?: string | null;
}) {
  const [reports, interactions] = await Promise.all([
    getDb().query.studentLessonReports.findMany({
      where: eq(studentLessonReports.classroomStudentId, params.classroomStudentId),
      with: { lesson: { with: { classroom: true } } },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 12,
    }),
    getDb().query.studentInteractions.findMany({
      where: eq(studentInteractions.classroomStudentId, params.classroomStudentId),
      with: { lesson: { with: { classroom: true } } },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 40,
    }),
  ]);

  const reportIds = reports.map((report) => report.id);
  const interactionIds = interactions.map((interaction) => interaction.id);

  const [existingReportEmbs, existingInteractionEmbs] = await Promise.all([
    reportIds.length > 0
      ? getDb().query.lessonEvidenceEmbeddings.findMany({
          where: and(
            eq(lessonEvidenceEmbeddings.classroomStudentId, params.classroomStudentId),
            eq(lessonEvidenceEmbeddings.sourceType, "report"),
            inArray(lessonEvidenceEmbeddings.sourceId, reportIds),
          ),
        })
      : Promise.resolve([]),
    interactionIds.length > 0
      ? getDb().query.lessonEvidenceEmbeddings.findMany({
          where: and(
            eq(lessonEvidenceEmbeddings.classroomStudentId, params.classroomStudentId),
            eq(lessonEvidenceEmbeddings.sourceType, "interaction"),
            inArray(lessonEvidenceEmbeddings.sourceId, interactionIds),
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

    await indexStudentReportEvidence({
      reportId: report.id,
      classroomStudentId: report.classroomStudentId,
      studentUserId: params.studentUserId ?? null,
      lessonId: report.lessonId,
      classroomId: report.lesson?.classroomId ?? null,
      lessonTitle: report.lesson?.title ?? null,
      language: report.sourceLocale,
      subjectKey: report.lesson?.courseId ?? null,
      gradeBand: report.lesson?.classroom.gradeBand ?? null,
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

    await indexStudentInteractionEvidence({
      interactionId: interaction.id,
      classroomStudentId: interaction.classroomStudentId,
      studentUserId: params.studentUserId ?? null,
      lessonId: interaction.lessonId ?? null,
      classroomId: interaction.lesson?.classroomId ?? null,
      lessonTitle: interaction.lesson?.title ?? null,
      language: interaction.lesson?.contentLocale ?? "en",
      subjectKey: interaction.lesson?.courseId ?? null,
      gradeBand: interaction.lesson?.classroom.gradeBand ?? null,
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

