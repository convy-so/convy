import { MetricsTime, Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { learningSessions, studentProgressReports } from "@/db/schema";
import { generateTeacherProgressReport } from "@/lib/learning/reporting";
import {
  createStudentProgressReport,
  listLearningInteractions,
  updateLearningSessionState,
  getStudentModelByClassroomStudentId,
  getLatestStudentModelSnapshot,
} from "@/lib/learning/storage";
import {
  learningSessionStateSchema,
  teacherProgressReportSchema,
} from "@/lib/learning/types";
import { type TutoringReportJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";

const tutoringReportJobSchema = z.object({
  sessionId: z.string().min(1),
  topicId: z.string().min(1),
  classroomId: z.string().min(1),
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
  const progressSignals = state.recentEvidence.length + state.knowledgeFocus.length;
  return Math.max(0, Math.min(100, progressSignals * 10));
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
    const studentModel = await getStudentModelByClassroomStudentId(data.classroomStudentId);
    const latestSnapshot = studentModel
      ? await getLatestStudentModelSnapshot(studentModel.id)
      : null;

    const report = await generateTeacherProgressReport({
      studentName: data.studentName,
      topicTitle: data.topicTitle,
      state,
      sessionId: data.sessionId,
      userId: data.studentUserId,
      transcript: interactions.map((interaction) => ({
        role: interaction.role,
        content: interaction.content,
        metadata: interaction.metadata as Record<string, unknown> | null,
      })),
      previousReport: data.previousReport ?? null,
      studentModel: latestSnapshot?.snapshot ?? null,
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
      state: {
        ...state,
        reportReady: true,
      },
      summary: report.studentSummary,
      expectedStateVersion: tutoringSession.stateVersion ?? 1,
    });

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
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2,
    },
  },
);

tutoringReportWorker.on("failed", (job, err) => {
  console.error("[tutoring-report-worker] job failed", {
    jobId: job?.id,
    sessionId: job?.data?.sessionId,
    message: err instanceof Error ? err.message : String(err),
  });
});

export default tutoringReportWorker;
