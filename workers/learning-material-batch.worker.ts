import { MetricsTime, Worker, type Job } from "bullmq";
import { z } from "zod";
import * as Sentry from "@sentry/node";

import {
  markLearningMaterialBatchFinalizerFailed,
  processLearningMaterialBatchFinalizer,
} from "@/lib/learning/materials-route-service";
import { type LearningMaterialBatchFinalizeJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";

const learningMaterialBatchJobSchema = z.object({
  batchId: z.string().min(1),
  topicId: z.string().min(1),
  classroomId: z.string().min(1),
});

const learningMaterialBatchWorker = new Worker<LearningMaterialBatchFinalizeJobData>(
  "learning-material-batch-finalize",
  async (job: Job<LearningMaterialBatchFinalizeJobData>) => {
    const data = learningMaterialBatchJobSchema.parse(job.data);
    const startedAt = Date.now();

    Sentry.logger.info("Learning material batch finalizer job started", {
      service: "workers",
      worker_name: "Learning Material Batch",
      job_id: job.id ?? "",
      batch_id: data.batchId,
      topic_id: data.topicId,
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

    Sentry.logger.info("Learning material batch finalizer job completed", {
      service: "workers",
      worker_name: "Learning Material Batch",
      job_id: job.id ?? "",
      batch_id: data.batchId,
      topic_id: data.topicId,
      duration_ms: Date.now() - startedAt,
      status: result.status,
    });

    return result;
  },
  {
    connection: getRedisClient({ fresh: true }),
    concurrency: 2,
    metrics: { maxDataPoints: MetricsTime.ONE_WEEK * 2 },
  },
);

learningMaterialBatchWorker.on("failed", (job, error) => {
  Sentry.logger.error("Learning material batch finalizer job failed unexpectedly", {
    service: "workers",
    worker_name: "Learning Material Batch",
    job_id: job?.id,
    error_message: error.message,
  });
});

export default learningMaterialBatchWorker;
