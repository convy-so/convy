import { MetricsTime, Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as Sentry from "@sentry/node";

import { getDb } from "@/shared/db";
import { classroomStudents, learningSessions, studentProgressReports } from "@/shared/db/schema";
import { buildStudentTeachingPlaybook, captureCompletedSessionPatternMemory } from "@/features/tutoring/server/pattern-memory-service";
import { generateTeacherProgressReport } from "@/features/tutoring/server/reporting";
import {
  createStudentProgressReport,
  listLearningInteractions,
  updateLearningSessionState,
} from "@/features/tutoring/public-server";
import {
  learningSessionStateSchema,
  studentInterestProfileSchema,
  teacherProgressReportSchema,
} from "@/features/tutoring/public-server";
import { type TutoringReportJobData } from "@/shared/infra/queue";
import { getRedisClient } from "@/shared/infra/redis";

const tutoringReportJobSchema = z.object({
  sessionId: z.string().min(1),
  topicId: z.string().min(1),
  classroomId: z.string().min(1),
  studentUserId: z.string().min(1),
  classroomStudentId: z.string().min(1),
  studentName: z.string().min(1),
  topicTitle: z.string().min(1),
  courseId: z.string().nullable().optional(),
  courseTitle: z.string().nullable().optional(),
  sourceLocale: z.string().nullable().optional(),
  previousReport: teacherProgressReportSchema.nullable().optional(),
});

function normalizeMetadata(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function computeMasteryPercent(
  state: ReturnType<typeof learningSessionStateSchema.parse>,
) {
  const progressSignals =
    state.recentEvidence.length +
    Math.min(state.turnCount, 4) +
    (state.completed ? 2 : 0);
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
    const membership = await getDb().query.classroomStudents.findFirst({
      where: and(
        eq(classroomStudents.id, data.classroomStudentId),
        eq(classroomStudents.userId, data.studentUserId),
      ),
      with: {
        interestProfile: true,
      },
    });
    const interestProfile = membership?.interestProfile?.profile
      ? studentInterestProfileSchema.parse(membership.interestProfile.profile)
      : null;
    const teachingPlaybook = await buildStudentTeachingPlaybook({
      studentUserId: data.studentUserId,
      subjectKey: data.courseId ?? null,
      subjectLabel: data.courseTitle ?? data.topicTitle,
      topicLocalGaps: [],
      topicLocalUsedExamples: [],
    });

    const report = await generateTeacherProgressReport({
      studentName: data.studentName,
      topicTitle: data.topicTitle,
      state,
      sessionId: data.sessionId,
      userId: data.studentUserId,
      transcript: interactions.map((interaction) => ({
        role: interaction.role,
        content: interaction.content,
        metadata: normalizeMetadata(interaction.metadata),
      })),
      previousReport: data.previousReport ?? null,
      teachingPlaybook: teachingPlaybook.playbook,
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

    if (interestProfile) {
      await captureCompletedSessionPatternMemory({
        studentName: data.studentName,
        studentUserId: data.studentUserId,
        classroomId: data.classroomId,
        classroomStudentId: data.classroomStudentId,
        topicId: data.topicId,
        topicTitle: data.topicTitle,
        subjectKey: data.courseId ?? null,
        subjectLabel: data.courseTitle ?? data.topicTitle,
        sessionId: data.sessionId,
        interestProfile,
        state,
        report,
        transcript: interactions.map((interaction) => ({
          role: interaction.role,
          content: interaction.content,
          metadata: normalizeMetadata(interaction.metadata),
        })),
        outOfSessionEvidence: [],
      });
    }

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
  Sentry.logger.error("Tutoring report worker job failed", {
    service: "tutoring-report-worker",
    job_id: job?.id ?? "",
    session_id: job?.data?.sessionId ?? "",
    error_message: err instanceof Error ? err.message : String(err),
  });
});

export default tutoringReportWorker;
