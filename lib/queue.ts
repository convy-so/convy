import { Queue, QueueEvents, QueueOptions } from "bullmq";
import { getRedisClient } from "@/lib/redis";

/**
 * Lazy Queue Management
 * Ensures queues are only initialized when first used.
 * Shares the same connection for producers unless a fresh one is requested.
 */

declare global {
  // eslint-disable-next-line no-var
  var queues: Record<string, Queue<any>> | undefined;
  // eslint-disable-next-line no-var
  var queueEvents: Record<string, QueueEvents> | undefined;
}

function getQueue<T>(
  name: string,
  options: Partial<QueueOptions> = {},
): Queue<T> {
  if (!global.queues) global.queues = {};

  if (!global.queues[name]) {
    global.queues[name] = new Queue(name, {
      connection: getRedisClient(),
      ...options,
    });
  }

  return global.queues![name] as Queue<T>;
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
    | "survey-deleted";
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

// Lazy getters for specific queues

export const getConversationInsightsQueue = () =>
  getQueue<ConversationInsightsJobData>("conversation-insights", {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });

export const getSurveyAnalyticsQueue = () =>
  getQueue<SurveyAnalyticsJobData>("survey-analytics", {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });

export const getEmailQueue = () =>
  getQueue<EmailJobData>("email", {
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });

export const getImageUploadQueue = () =>
  getQueue<ImageUploadJobData>("image-upload", {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });

export const getExperimentEvaluationQueue = () =>
  getQueue("experiment-evaluation", {
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 30 },
    },
  });

export const getNotificationQueue = () =>
  getQueue<{
    type: "email" | "in_app";
    userId: string;
    message: string;
    metadata?: Record<string, unknown>;
  }>("notifications", {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    },
  });

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

  if (global.queues) {
    await Promise.all(Object.values(global.queues).map((q) => q.close()));
    global.queues = undefined;
  }

  if (global.queueEvents) {
    await Promise.all(
      Object.values(global.queueEvents).map((qe) => qe.close()),
    );
    global.queueEvents = undefined;
  }

  await closeRedisConnections();
}
