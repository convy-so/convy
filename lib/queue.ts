import { createHash } from "node:crypto";
import { Queue, QueueOptions } from "bullmq";
import { getRedisClient } from "@/lib/redis";

/**
 * Lazy Queue Management
 * Ensures queues are only initialized when first used.
 * Shares the same connection for producers unless a fresh one is requested.
 */

declare global {
  var surveyAnalyticsQueue: Queue<SurveyAnalyticsJobData> | undefined;
  var emailQueue: Queue<EmailJobData> | undefined;
  var imageUploadQueue: Queue<ImageUploadJobData> | undefined;
  var tutoringReportQueue:
    | Queue<TutoringReportJobData>
    | undefined;
  var learningMaterialProcessingQueue:
    | Queue<LearningMaterialProcessingJobData>
    | undefined;
  var learningMaterialBatchFinalizeQueue:
    | Queue<LearningMaterialBatchFinalizeJobData>
    | undefined;

  var contentTranslationQueue: Queue<ContentTranslationJobData> | undefined;
  var experimentEvaluationQueue: Queue<unknown> | undefined;
  var notificationQueue:
    | Queue<{
        type: "email" | "in_app";
        userId: string;
        message: string;
        metadata?: Record<string, unknown>;
      }>
    | undefined;
}

function createQueue<T>(
  name: string,
  options: Partial<QueueOptions> = {},
): Queue<T> {
  return new Queue(name, {
    connection: getRedisClient(),
    ...options,
  });
}

export interface SurveyAnalyticsJobData {
  surveyId: string;
  userId: string;
  reason?: string;
  score?: number;
}

export interface EmailJobData {
  type:
    | "verification"
    | "password-reset"
    | "expert-invitation-verification"
    | "expert-password-setup"
    | "secondary-verification"
    | "survey-deleted"
    | "student-invitation";
  email: string;
  url: string;
  name?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface ImageUploadJobData {
  surveyId: string;
  imageId: string;
  buffer: Buffer;
  contentType: string;
  userId: string;
}

export interface TutoringReportJobData {
  sessionId: string;
  topicId: string;
  classroomId: string;
  studentUserId: string;
  classroomStudentId: string;
  studentName: string;
  topicTitle: string;
  sourceLocale?: string | null;
  previousReport?: Record<string, unknown> | null;
  subjectKey?: string | null;
}

export interface LearningMaterialProcessingJobData {
  attemptId: string;
  topicId: string;
  classroomId: string;
  userId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  title?: string | null;
  description?: string | null;
}

export interface LearningMaterialBatchFinalizeJobData {
  batchId: string;
  topicId: string;
  classroomId: string;
}



export interface ContentTranslationJobData {
  resourceType: string;
  resourceId: string;
  field: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  context?: string;
}

// Lazy getters for specific queues

export const getSurveyAnalyticsQueue = () => {
  if (!global.surveyAnalyticsQueue) {
    global.surveyAnalyticsQueue = createQueue<SurveyAnalyticsJobData>(
      "survey-analytics",
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: true,
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
    );
  }

  return global.surveyAnalyticsQueue;
};

export const getEmailQueue = () => {
  if (!global.emailQueue) {
    global.emailQueue = createQueue<EmailJobData>("email", {
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }

  return global.emailQueue;
};

export const getImageUploadQueue = () => {
  if (!global.imageUploadQueue) {
    global.imageUploadQueue = createQueue<ImageUploadJobData>("image-upload", {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }

  return global.imageUploadQueue;
};

export const getTutoringReportQueue = () => {
  if (!global.tutoringReportQueue) {
    global.tutoringReportQueue =
      createQueue<TutoringReportJobData>("tutoring-report", {
        defaultJobOptions: {
          attempts: 4,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: true,
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      });
  }

  return global.tutoringReportQueue;
};

export const getLearningMaterialProcessingQueue = () => {
  if (!global.learningMaterialProcessingQueue) {
    global.learningMaterialProcessingQueue =
      createQueue<LearningMaterialProcessingJobData>(
        "learning-material-processing",
        {
          defaultJobOptions: {
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { age: 7 * 24 * 3600 },
          },
        },
      );
  }

  return global.learningMaterialProcessingQueue;
};

export const getLearningMaterialBatchFinalizeQueue = () => {
  if (!global.learningMaterialBatchFinalizeQueue) {
    global.learningMaterialBatchFinalizeQueue =
      createQueue<LearningMaterialBatchFinalizeJobData>(
        "learning-material-batch-finalize",
        {
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 2000 },
            removeOnComplete: true,
            removeOnFail: { age: 7 * 24 * 3600 },
          },
        },
      );
  }

  return global.learningMaterialBatchFinalizeQueue;
};



export const getContentTranslationQueue = () => {
  if (!global.contentTranslationQueue) {
    global.contentTranslationQueue =
      createQueue<ContentTranslationJobData>("content-translation", {
        defaultJobOptions: {
          attempts: 4,
          backoff: { type: "exponential", delay: 4000 },
          removeOnComplete: true,
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      });
  }

  return global.contentTranslationQueue;
};

export const getExperimentEvaluationQueue = () => {
  if (!global.experimentEvaluationQueue) {
    global.experimentEvaluationQueue = createQueue("experiment-evaluation", {
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 30 },
        removeOnFail: { count: 30 },
      },
    });
  }

  return global.experimentEvaluationQueue;
};

export const getNotificationQueue = () => {
  if (!global.notificationQueue) {
    global.notificationQueue = createQueue("notifications", {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600 },
      },
    });
  }

  return global.notificationQueue;
};

// Enqueue helpers

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

  const job = await getEmailQueue().add(`send-${data.type}`, {
    ...data,
    idempotencyKey,
  }, {
    jobId: idempotencyKey,
    priority: 1,
  });

  if (!job) {
    // BullMQ returns null when a job with the same jobId already exists in the queue.
    // This means the email was silently deduplicated — no new job was enqueued.
    console.warn("[queue] enqueueEmail: job was SILENTLY DEDUPLICATED by BullMQ — a job with this idempotencyKey already exists in the queue", {
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
  return await getLearningMaterialProcessingQueue().add(
    "process-learning-material",
    data,
    {
      jobId: `learning-material-${data.attemptId}`,
      priority: 2,
    },
  );
}

export async function enqueueLearningMaterialBatchFinalize(
  data: LearningMaterialBatchFinalizeJobData,
) {
  return await getLearningMaterialBatchFinalizeQueue().add(
    "finalize-learning-material-batch",
    data,
    {
      jobId: `learning-material-batch-${data.batchId}`,
      priority: 1,
    },
  );
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

export async function enqueueNotification(data: {
  type: "email" | "in_app";
  userId: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  return await getNotificationQueue().add("notify", data, {
    priority: 2,
  });
}

export async function closeQueues() {
  const { closeRedisConnections } = await import("@/lib/redis");

  const queues = [
    global.surveyAnalyticsQueue,
    global.emailQueue,
    global.imageUploadQueue,
    global.tutoringReportQueue,
    global.learningMaterialProcessingQueue,
    global.learningMaterialBatchFinalizeQueue,

    global.contentTranslationQueue,
    global.experimentEvaluationQueue,
    global.notificationQueue,
  ].filter((queue): queue is Queue<unknown> => Boolean(queue));

  if (queues.length > 0) {
    await Promise.all(queues.map((queue) => queue.close()));
    global.surveyAnalyticsQueue = undefined;
    global.emailQueue = undefined;
    global.imageUploadQueue = undefined;
    global.tutoringReportQueue = undefined;
    global.learningMaterialProcessingQueue = undefined;
    global.learningMaterialBatchFinalizeQueue = undefined;

    global.contentTranslationQueue = undefined;
    global.experimentEvaluationQueue = undefined;
    global.notificationQueue = undefined;
  }

  await closeRedisConnections();
}
