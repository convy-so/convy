import { MetricsTime, Worker, type Job } from "bullmq";
import { z } from "zod";
import * as Sentry from "@sentry/node";

import { processLearningMaterialUploadAttempt } from "@/features/tutoring/server/materials-route-service";
import { type LessonMaterialProcessingJobData } from "@/shared/infra/queue";
import { getRedisClient } from "@/shared/infra/redis";

const learningMaterialJobSchema = z.object({
  attemptId: z.string().min(1),
  lessonId: z.string().min(1),
  classroomId: z.string().min(1),
  userId: z.string().min(1),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

function getResultSuccess(value: unknown): boolean | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const success = (value as Record<string, unknown>).success;
  return typeof success === "boolean" ? success : null;
}

const learningMaterialWorker = new Worker<LessonMaterialProcessingJobData>(
  "lesson-material-processing",
  async (job: Job<LessonMaterialProcessingJobData>) => {
    const data = learningMaterialJobSchema.parse(job.data);
    const startedAt = Date.now();

    Sentry.logger.info("Lesson material worker job started", {
      service: "workers",
      worker_name: "Learning Material",
      job_id: job.id ?? "",
      attempt_id: data.attemptId,
      lesson_id: data.lessonId,
      file_name: data.fileName,
      mime_type: data.mimeType,
    });
    console.info("[lesson-material-worker] job started", {
      jobId: job.id ?? null,
      attemptId: data.attemptId,
      lessonId: data.lessonId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
    });

    await job.updateProgress(10);

    const result = await processLearningMaterialUploadAttempt(data);
    await job.updateProgress(100);

    if (!result.success) {
      Sentry.logger.warn("Lesson material processing failed", {
        service: "workers",
        worker_name: "Learning Material",
        job_id: job.id ?? "",
        attempt_id: data.attemptId,
        lesson_id: data.lessonId,
        error_message: result.error,
        duration_ms: Date.now() - startedAt,
      });
      console.warn("[lesson-material-worker] job completed with pipeline failure", {
        jobId: job.id ?? null,
        attemptId: data.attemptId,
        lessonId: data.lessonId,
        error: result.error,
        durationMs: Date.now() - startedAt,
      });
    } else {
      Sentry.logger.info("Lesson material worker job completed", {
        service: "workers",
        worker_name: "Learning Material",
        job_id: job.id ?? "",
        attempt_id: data.attemptId,
        lesson_id: data.lessonId,
        material_id: result.materialId ?? "",
        duration_ms: Date.now() - startedAt,
      });
      console.info("[lesson-material-worker] job completed", {
        jobId: job.id ?? null,
        attemptId: data.attemptId,
        lessonId: data.lessonId,
        materialId: result.materialId ?? null,
        durationMs: Date.now() - startedAt,
      });
    }

    return result;
  },
  {
    connection: getRedisClient({ fresh: true }),
    // Keep background material analysis serialized to avoid bursty provider spend.
    concurrency: 1,
    metrics: { maxDataPoints: MetricsTime.ONE_WEEK * 2 },
  },
);

learningMaterialWorker.on("active", (job) => {
  console.info("[lesson-material-worker] job active", {
    jobId: job.id ?? null,
    attemptId: job.data.attemptId,
    lessonId: job.data.lessonId,
  });
});

learningMaterialWorker.on("completed", (job, result) => {
  console.info("[lesson-material-worker] bullmq completed event", {
    jobId: job.id ?? null,
    attemptId: job.data.attemptId,
    lessonId: job.data.lessonId,
    success: getResultSuccess(result),
  });
});

learningMaterialWorker.on("failed", (job, error) => {
  Sentry.logger.error("Lesson material worker job failed unexpectedly", {
    service: "workers",
    worker_name: "Learning Material",
    job_id: job?.id,
    error_message: error.message,
  });
  console.error("[lesson-material-worker] bullmq failed event", {
    jobId: job?.id ?? null,
    attemptId: job?.data.attemptId ?? null,
    lessonId: job?.data.lessonId ?? null,
    error,
  });
});

learningMaterialWorker.on("stalled", (jobId) => {
  Sentry.logger.warn("Lesson material worker job stalled", {
    service: "workers",
    worker_name: "Learning Material",
    job_id: jobId,
  });
  console.warn("[lesson-material-worker] bullmq stalled event", {
    jobId,
  });
});

learningMaterialWorker.on("error", (error) => {
  Sentry.logger.error("Lesson material worker error", {
    service: "workers",
    worker_name: "Learning Material",
    error_message: error.message,
  });
  console.error("[lesson-material-worker] worker error", { error });
});

export default learningMaterialWorker;

