import { createHash } from "node:crypto";

import { closeRedisConnections } from "@/shared/infra/redis";
import type {
  ContentTranslationJobData,
  EmailJobData,
  ImageUploadJobData,
  LearningMaterialBatchFinalizeJobData,
  LearningMaterialProcessingJobData,
  NotificationJobData,
  SurveyAnalyticsJobData,
  TutoringReportJobData,
} from "@/shared/infra/queue/job-data";
import {
  clearQueueRegistry,
  getContentTranslationQueue,
  getEmailQueue,
  getExperimentEvaluationQueue,
  getImageUploadQueue,
  getLearningMaterialBatchFinalizeQueue,
  getLearningMaterialProcessingQueue,
  getNotificationQueue,
  getSurveyAnalyticsQueue,
  getTutoringReportQueue,
  listOpenQueues,
} from "@/shared/infra/queue/queue-registry";

export async function enqueueSurveyAnalytics(data: SurveyAnalyticsJobData) {
  const timestamp = Date.now();
  return await getSurveyAnalyticsQueue().add("generate-analytics", data, {
    jobId: `analytics-${data.surveyId}-${timestamp}`,
    priority: 3,
  });
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function buildEmailIdempotencyKey(data: EmailJobData) {
  if (data.idempotencyKey) {
    return data.idempotencyKey;
  }

  const digest = createHash("sha256")
    .update(
      stableSerialize({
        type: data.type,
        email: data.email.trim().toLowerCase(),
        url: data.url,
        name: data.name ?? null,
        metadata: data.metadata ?? null,
      }),
    )
    .digest("hex");

  return `email-${digest}`;
}

export async function enqueueEmail(data: EmailJobData) {
  const idempotencyKey = buildEmailIdempotencyKey(data);

  console.log("[queue] enqueueEmail: enqueueing job", {
    type: data.type,
    email: data.email,
    idempotencyKey,
  });

  const job = await getEmailQueue().add(
    `send-${data.type}`,
    {
      ...data,
      idempotencyKey,
    },
    {
      jobId: idempotencyKey,
      priority: 1,
    },
  );

  if (!job) {
    console.warn("[queue] enqueueEmail: job was SILENTLY DEDUPLICATED by BullMQ - a job with this idempotencyKey already exists in the queue", {
      type: data.type,
      email: data.email,
      idempotencyKey,
    });
    return null;
  }

  console.log("[queue] enqueueEmail: job enqueued", {
    type: data.type,
    email: data.email,
    jobId: job.id,
    idempotencyKey,
  });

  return job;
}

export async function enqueueImageUpload(data: ImageUploadJobData) {
  return await getImageUploadQueue().add("upload-image", data, {
    jobId: `image-upload-${data.surveyId}-${data.imageId}`,
    priority: 2,
  });
}

export async function enqueueTutoringReportGeneration(
  data: TutoringReportJobData,
) {
  const timestamp = Date.now();
  return await getTutoringReportQueue().add("generate-teacher-report", data, {
    jobId: `tutoring-report-${data.sessionId}-${timestamp}`,
    priority: 1,
  });
}

export async function enqueueLearningMaterialProcessing(
  data: LearningMaterialProcessingJobData,
) {
  const jobId = `learning-material-${data.attemptId}`;

  console.log("[queue] enqueueLearningMaterialProcessing: enqueueing job", {
    attemptId: data.attemptId,
    topicId: data.topicId,
    classroomId: data.classroomId,
    storagePath: data.storagePath,
    fileName: data.fileName,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
    jobId,
  });

  const job = await getLearningMaterialProcessingQueue().add(
    "process-learning-material",
    data,
    {
      jobId,
      priority: 2,
    },
  );

  console.log("[queue] enqueueLearningMaterialProcessing: job enqueued", {
    attemptId: data.attemptId,
    topicId: data.topicId,
    jobId: job?.id ?? jobId,
    queueName: job?.queueName ?? "learning-material-processing",
  });

  return job;
}

export async function enqueueLearningMaterialBatchFinalize(
  data: LearningMaterialBatchFinalizeJobData,
) {
  const jobId = `learning-material-batch-${data.batchId}`;

  console.log("[queue] enqueueLearningMaterialBatchFinalize: enqueueing job", {
    batchId: data.batchId,
    topicId: data.topicId,
    classroomId: data.classroomId,
    jobId,
  });

  const job = await getLearningMaterialBatchFinalizeQueue().add(
    "finalize-learning-material-batch",
    data,
    {
      jobId,
      priority: 1,
    },
  );

  console.log("[queue] enqueueLearningMaterialBatchFinalize: job enqueued", {
    batchId: data.batchId,
    topicId: data.topicId,
    jobId: job?.id ?? jobId,
    queueName: job?.queueName ?? "learning-material-batch-finalize",
  });

  return job;
}

export async function enqueueContentTranslation(data: ContentTranslationJobData) {
  return await getContentTranslationQueue().add("translate-content", data, {
    jobId: `translation-${data.resourceType}-${data.resourceId}-${data.field}-${data.targetLocale}`,
    priority: 2,
  });
}

export async function scheduleExperimentEvaluation() {
  return await getExperimentEvaluationQueue().upsertJobScheduler(
    "experiment-evaluation-nightly",
    { pattern: "0 3 * * *" },
    {
      name: "nightly-evaluation",
      data: {},
      opts: { removeOnComplete: true, removeOnFail: true },
    },
  );
}

export async function enqueueNotification(data: NotificationJobData) {
  return await getNotificationQueue().add("notify", data, {
    priority: 2,
  });
}

export async function closeQueues() {
  const queues = listOpenQueues();

  if (queues.length > 0) {
    await Promise.all(queues.map((queue) => queue.close()));
    clearQueueRegistry();
  }

  await closeRedisConnections();
}
