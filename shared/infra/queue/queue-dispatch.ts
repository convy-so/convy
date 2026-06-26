import { createHash } from "node:crypto";

import { closeRedisConnections } from "@/shared/infra/redis";
import type {
  ContentTranslationJobData,
  EmailJobData,
  ImageUploadJobData,
  LessonMaterialBatchFinalizeJobData,
  LessonMaterialProcessingJobData,
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
  getLessonMaterialBatchFinalizeQueue,
  getLessonMaterialProcessingQueue,
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

export async function enqueueLessonMaterialProcessing(
  data: LessonMaterialProcessingJobData,
) {
  const jobId = `lesson-material-${data.attemptId}`;

  console.log("[queue] enqueueLessonMaterialProcessing: enqueueing job", {
    attemptId: data.attemptId,
    lessonId: data.lessonId,
    classroomId: data.classroomId,
    storagePath: data.storagePath,
    fileName: data.fileName,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
    jobId,
  });

  const job = await getLessonMaterialProcessingQueue().add(
    "process-lesson-material",
    data,
    {
      jobId,
      priority: 2,
    },
  );

  console.log("[queue] enqueueLessonMaterialProcessing: job enqueued", {
    attemptId: data.attemptId,
    lessonId: data.lessonId,
    jobId: job?.id ?? jobId,
    queueName: job?.queueName ?? "lesson-material-processing",
  });

  return job;
}

export async function enqueueLessonMaterialBatchFinalize(
  data: LessonMaterialBatchFinalizeJobData,
) {
  const jobId = `lesson-material-batch-${data.batchId}`;

  console.log("[queue] enqueueLessonMaterialBatchFinalize: enqueueing job", {
    batchId: data.batchId,
    lessonId: data.lessonId,
    classroomId: data.classroomId,
    jobId,
  });

  const job = await getLessonMaterialBatchFinalizeQueue().add(
    "finalize-lesson-material-batch",
    data,
    {
      jobId,
      priority: 1,
    },
  );

  console.log("[queue] enqueueLessonMaterialBatchFinalize: job enqueued", {
    batchId: data.batchId,
    lessonId: data.lessonId,
    jobId: job?.id ?? jobId,
    queueName: job?.queueName ?? "lesson-material-batch-finalize",
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

