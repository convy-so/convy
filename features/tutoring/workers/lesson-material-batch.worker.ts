import { MetricsTime, Worker, type Job } from "bullmq";
import { z } from "zod";
import * as Sentry from "@sentry/node";

import {
  markLearningMaterialBatchFinalizerFailed,
  processLearningMaterialBatchFinalizer,
} from "@/features/tutoring/server/materials-route-service";
import { type LessonMaterialBatchFinalizeJobData } from "@/shared/infra/queue";
import { getRedisClient } from "@/shared/infra/redis";

const learningMaterialBatchJobSchema = z.object({
  batchId: z.string().min(1),
  lessonId: z.string().min(1),
  classroomId: z.string().min(1),
});

function getResultStatus(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const status = (value as Record<string, unknown>).status;
  return typeof status === "string" ? status : null;
}

const learningMaterialBatchWorker = new Worker<LessonMaterialBatchFinalizeJobData>(
  "lesson-material-batch-finalize",
  async (job: Job<LessonMaterialBatchFinalizeJobData>) => {
    const data = learningMaterialBatchJobSchema.parse(job.data);
    const startedAt = Date.now();

    Sentry.logger.info("Lesson material batch finalizer job started", {
      service: "workers",
      worker_name: "Learning Material Batch",
      job_id: job.id ?? "",
      batch_id: data.batchId,
      lesson_id: data.lessonId,
    });
    console.info("[lesson-material-batch-worker] job started", {
      jobId: job.id ?? null,
      batchId: data.batchId,
      lessonId: data.lessonId,
      classroomId: data.classroomId,
    });

    let result;
    try {
      result = await processLearningMaterialBatchFinalizer(data);
    } catch (error) {
      const maxAttempts =
        typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
      if (job.attemptsMade + 1 >= maxAttempts) {
        await markLearningMaterialBatchFinalizerFailed(data, error);
      }
      throw error;
    }

    Sentry.logger.info("Lesson material batch finalizer job completed", {
      service: "workers",
      worker_name: "Learning Material Batch",
      job_id: job.id ?? "",
      batch_id: data.batchId,
      lesson_id: data.lessonId,
      duration_ms: Date.now() - startedAt,
      status: result.status,
    });
    console.info("[lesson-material-batch-worker] job completed", {
      jobId: job.id ?? null,
      batchId: data.batchId,
      lessonId: data.lessonId,
      status: result.status,
      durationMs: Date.now() - startedAt,
    });

    return result;
  },
  {
    connection: getRedisClient({ fresh: true }),
    concurrency: 2,
    metrics: { maxDataPoints: MetricsTime.ONE_WEEK * 2 },
  },
);

learningMaterialBatchWorker.on("active", (job) => {
  console.info("[lesson-material-batch-worker] job active", {
    jobId: job.id ?? null,
    batchId: job.data.batchId,
    lessonId: job.data.lessonId,
  });
});

learningMaterialBatchWorker.on("completed", (job, result) => {
  console.info("[lesson-material-batch-worker] bullmq completed event", {
    jobId: job.id ?? null,
    batchId: job.data.batchId,
    lessonId: job.data.lessonId,
    status: getResultStatus(result),
  });
});

learningMaterialBatchWorker.on("failed", (job, error) => {
  Sentry.logger.error("Lesson material batch finalizer job failed unexpectedly", {
    service: "workers",
    worker_name: "Learning Material Batch",
    job_id: job?.id,
    error_message: error.message,
  });
  console.error("[lesson-material-batch-worker] bullmq failed event", {
    jobId: job?.id ?? null,
    batchId: job?.data.batchId ?? null,
    lessonId: job?.data.lessonId ?? null,
    error,
  });
});

learningMaterialBatchWorker.on("stalled", (jobId) => {
  Sentry.logger.warn("Lesson material batch finalizer job stalled", {
    service: "workers",
    worker_name: "Learning Material Batch",
    job_id: jobId,
  });
  console.warn("[lesson-material-batch-worker] bullmq stalled event", {
    jobId,
  });
});

learningMaterialBatchWorker.on("error", (error) => {
  Sentry.logger.error("Lesson material batch finalizer worker error", {
    service: "workers",
    worker_name: "Learning Material Batch",
    error_message: error.message,
  });
  console.error("[lesson-material-batch-worker] worker error", { error });
});

export default learningMaterialBatchWorker;

