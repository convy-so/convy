import { Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { learningSessions, studentProgressReports } from "@/db/schema";
import { generateTeacherProgressReport } from "@/lib/learning/reporting";
import {
  createStudentProgressReport,
  listLearningInteractions,
  updateLearningSessionState,
} from "@/lib/learning/storage";
import {
  learningSessionStateSchema,
  teacherProgressReportSchema,
} from "@/lib/learning/types";
import {
  enqueueLearningPatternAnalysis,
  type TutoringReportJobData,
} from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";

const tutoringReportJobSchema = z.object({
  sessionId: z.string().min(1),
  topicId: z.string().min(1),
  organizationId: z.string().min(1),
  studentUserId: z.string().min(1),
  classroomStudentId: z.string().min(1),
  studentName: z.string().min(1),
  topicTitle: z.string().min(1),
  sourceLocale: z.string().nullable().optional(),
  previousReport: teacherProgressReportSchema.nullable().optional(),
  subjectKey: z.string().nullable().optional(),
});

function computeMasteryPercent(
  state: ReturnType<typeof learningSessionStateSchema.parse>,
) {
  if (state.conceptsToCover.length === 0) return 0;

  const scores = state.conceptsToCover.map((concept) => {
    const conceptState = state.conceptStates[concept.key];
    return conceptState?.masteryScore ?? 0;
  });

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

const tutoringReportWorker = new Worker<TutoringReportJobData>(
  "tutoring-report",
  async (job: Job<TutoringReportJobData>) => {
    const data = tutoringReportJobSchema.parse(job.data);

    const existingReport = await getDb().query.studentProgressReports.findFirst({
      where: eq(studentProgressReports.generatedFromSessionId, data.sessionId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });
    if (existingReport) {
      await job.updateProgress(100);
      return {
        success: true,
        skipped: "existing_report",
        sessionId: data.sessionId,
      };
    }

    const tutoringSession = await getDb().query.learningSessions.findFirst({
      where: and(
        eq(learningSessions.id, data.sessionId),
        eq(learningSessions.sessionType, "tutoring"),
      ),
    });

    if (!tutoringSession) {
      throw new Error("Tutoring session not found for report generation.");
    }

    const state = learningSessionStateSchema.parse(tutoringSession.state ?? {});
    const interactions = await listLearningInteractions({
      classroomStudentId: data.classroomStudentId,
      sessionId: data.sessionId,
    });

    const report = await generateTeacherProgressReport({
      studentName: data.studentName,
      topicTitle: data.topicTitle,
      state,
      interactions: interactions.map((interaction) => ({
        role: interaction.role,
        interactionType: interaction.interactionType,
        content: interaction.content,
        metadata: interaction.metadata as Record<string, unknown> | null,
      })),
      sessionStartedAt: tutoringSession.createdAt,
      sessionCompletedAt: tutoringSession.completedAt ?? new Date(),
      previousReport: data.previousReport ?? null,
    });

    await createStudentProgressReport({
      topicId: data.topicId,
      classroomStudentId: data.classroomStudentId,
      generatedFromSessionId: data.sessionId,
      masteryPercent: computeMasteryPercent(state),
      sourceLocale: data.sourceLocale ?? "en",
      report,
    });

    await updateLearningSessionState({
      sessionId: data.sessionId,
      state,
      summary: report.studentSummary,
    });

    await enqueueLearningPatternAnalysis({
      sourceType: "session",
      sourceId: data.sessionId,
      organizationId: data.organizationId,
      studentUserId: data.studentUserId,
      classroomStudentId: data.classroomStudentId,
      topicId: data.topicId,
      subjectKey: data.subjectKey ?? null,
    }).catch(() => undefined);

    await job.updateProgress(100);
    return {
      success: true,
      sessionId: data.sessionId,
      reportSummary: report.studentSummary,
    };
  },
  {
    connection: getRedisClient(),
    concurrency: 2,
  },
);

export default tutoringReportWorker;
