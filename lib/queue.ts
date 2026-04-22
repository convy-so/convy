import { Queue, QueueEvents, QueueOptions } from "bullmq";
import { getRedisClient } from "@/lib/redis";

/**
 * Lazy Queue Management
 * Ensures queues are only initialized when first used.
 * Shares the same connection for producers unless a fresh one is requested.
 */

declare global {
  var conversationInsightsQueue: Queue<ConversationInsightsJobData> | undefined;
  var surveyAnalyticsQueue: Queue<SurveyAnalyticsJobData> | undefined;
  var emailQueue: Queue<EmailJobData> | undefined;
  var imageUploadQueue: Queue<ImageUploadJobData> | undefined;
  var tutoringReportQueue:
    | Queue<TutoringReportJobData>
    | undefined;
  var evalRunQueue: Queue<EvalRunJobData> | undefined;
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
  var queueEvents: Record<string, QueueEvents> | undefined;
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

export interface ConversationInsightsJobData {
  conversationId: string;
  surveyId: string;
  userId: string;
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
    | "workspace-invitation"
    | "workspace-welcome"
    | "secondary-verification"
    | "survey-deleted"
    | "student-activation";
  email: string;
  url: string;
  name?: string | null;
  metadata?: Record<string, unknown>;
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
  organizationId: string;
  studentUserId: string;
  classroomStudentId: string;
  studentName: string;
  topicTitle: string;
  sourceLocale?: string | null;
  previousReport?: Record<string, unknown> | null;
  subjectKey?: string | null;
}

export interface EvalRunJobData {
  evalRunId: string;
  datasetId: string;
  feature: string;
  triggeredByUserId?: string | null;
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

export const getConversationInsightsQueue = () => {
  if (!global.conversationInsightsQueue) {
    global.conversationInsightsQueue = createQueue<ConversationInsightsJobData>(
      "conversation-insights",
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
    );
  }

  return global.conversationInsightsQueue;
};

export const getSurveyAnalyticsQueue = () => {
  if (!global.surveyAnalyticsQueue) {
    global.surveyAnalyticsQueue = createQueue<SurveyAnalyticsJobData>(
      "survey-analytics",
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: { age: 24 * 3600, count: 1000 },
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
        removeOnComplete: { age: 24 * 3600, count: 1000 },
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
        removeOnComplete: { age: 24 * 3600, count: 1000 },
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
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      });
  }

  return global.tutoringReportQueue;
};

export const getEvalRunQueue = () => {
  if (!global.evalRunQueue) {
    global.evalRunQueue = createQueue<EvalRunJobData>("eval-run", {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 4000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }

  return global.evalRunQueue;
};

export const getContentTranslationQueue = () => {
  if (!global.contentTranslationQueue) {
    global.contentTranslationQueue =
      createQueue<ContentTranslationJobData>("content-translation", {
        defaultJobOptions: {
          attempts: 4,
          backoff: { type: "exponential", delay: 4000 },
          removeOnComplete: { age: 24 * 3600, count: 1000 },
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

export async function enqueueConversationInsights(
  data: ConversationInsightsJobData,
) {
  return await getConversationInsightsQueue().add("generate-insights", data, {
    jobId: `insights-${data.conversationId}`,
    priority: 2,
  });
}

export async function enqueueSurveyAnalytics(data: SurveyAnalyticsJobData) {
  return await getSurveyAnalyticsQueue().add("generate-analytics", data, {
    jobId: `analytics-${data.surveyId}`,
    priority: 3,
  });
}

export async function enqueueEmail(data: EmailJobData) {
  return await getEmailQueue().add(`send-${data.type}`, data, {
    priority: 1,
  });
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
  return await getTutoringReportQueue().add("generate-teacher-report", data, {
    jobId: `tutoring-report-${data.sessionId}`,
    priority: 1,
  });
}

export async function enqueueEvalRun(data: EvalRunJobData) {
  return await getEvalRunQueue().add("run-eval-dataset", data, {
    jobId: `eval-run-${data.evalRunId}`,
    priority: 2,
  });
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
    global.conversationInsightsQueue,
    global.surveyAnalyticsQueue,
    global.emailQueue,
    global.imageUploadQueue,
    global.tutoringReportQueue,
    global.evalRunQueue,
    global.contentTranslationQueue,
    global.experimentEvaluationQueue,
    global.notificationQueue,
  ].filter((queue): queue is Queue<unknown> => Boolean(queue));

  if (queues.length > 0) {
    await Promise.all(queues.map((queue) => queue.close()));
    global.conversationInsightsQueue = undefined;
    global.surveyAnalyticsQueue = undefined;
    global.emailQueue = undefined;
    global.imageUploadQueue = undefined;
    global.tutoringReportQueue = undefined;
    global.evalRunQueue = undefined;
    global.contentTranslationQueue = undefined;
    global.experimentEvaluationQueue = undefined;
    global.notificationQueue = undefined;
  }

  if (global.queueEvents) {
    await Promise.all(
      Object.values(global.queueEvents).map((qe) => qe.close()),
    );
    global.queueEvents = undefined;
  }

  await closeRedisConnections();
}
