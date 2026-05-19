import { MetricsTime, Worker, type Job } from "bullmq";
import { z } from "zod";
import * as Sentry from "@sentry/node";

import { processLearningMaterialUploadAttempt } from "@/lib/learning/materials-route-service";
import { type LearningMaterialProcessingJobData } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";

const learningMaterialJobSchema = z.object({
  attemptId: z.string().min(1),
  topicId: z.string().min(1),
  classroomId: z.string().min(1),
  userId: z.string().min(1),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

const learningMaterialWorker = new Worker<LearningMaterialProcessingJobData>(
  "learning-material-processing",
  async (job: Job<LearningMaterialProcessingJobData>) => {
    const data = learningMaterialJobSchema.parse(job.data);
    await job.updateProgress(10);

    const result = await processLearningMaterialUploadAttempt(data);
    await job.updateProgress(100);

    if (!result.success) {
      Sentry.logger.warn("Learning material processing failed", {
        service: "workers",
        worker_name: "Learning Material",
        attempt_id: data.attemptId,
        topic_id: data.topicId,
        error_message: result.error,
      });
    }

    return result;
  },
  {
    connection: getRedisClient({ fresh: true }),
    concurrency: 2,
    metrics: { maxDataPoints: MetricsTime.ONE_WEEK * 2 },
  },
);

learningMaterialWorker.on("failed", (job, error) => {
  Sentry.logger.error("Learning material worker job failed unexpectedly", {
    service: "workers",
    worker_name: "Learning Material",
    job_id: job?.id,
    error_message: error.message,
  });
});

export default learningMaterialWorker;
