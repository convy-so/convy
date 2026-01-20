import "server-only";

import { Queue, QueueEvents } from "bullmq";
import { getRedisClient, createBlockingClient } from "@/lib/redis";
import type { WebhookPayload } from "@/lib/zapier/types";

const sharedConnection = getRedisClient();

export interface ConversationInsightsJobData {
  conversationId: string;
  surveyId: string;
  userId: string;
}

export interface SurveyAnalyticsJobData {
  surveyId: string;
  userId: string;
}

export interface SampleConversationInsightsJobData {
  surveyId: string;
  conversationNumber: number;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userId: string;
}

export interface EmailJobData {
  type:
    | "verification"
    | "password-reset"
    | "workspace-invitation"
    | "subscription-expiration"
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

export interface NotionSyncJobData {
  userId: string;
  surveyId?: string;
  syncType: "survey" | "analytics" | "conversation" | "full";
  targetId?: string;
  forceUpdate?: boolean;
}

export interface NotionBulkOperationJobData {
  operationId: string;
  userId: string;
  operationType: "sync_all" | "sync_selected" | "resync" | "archive" | "delete";
  surveyIds: string[];
  batchSize?: number;
}

export interface SubscriptionMonitorJobData {
  checkDate?: string;
}

export interface SlackSyncJobData {
  userId: string;
  surveyId?: string;
  syncType: "digest" | "analytics" | "survey_created";
  targetId?: string;
}

export type NotionSyncScheduleMode =
  | "hourly"
  | "every3h"
  | "every5h"
  | "daily_hour";

export type SlackSyncScheduleMode =
  | "hourly"
  | "every3h"
  | "every5h"
  | "daily_hour"
  | "disabled";

export const conversationInsightsQueue = new Queue<ConversationInsightsJobData>(
  "conversation-insights",
  {
    connection: sharedConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
      },
    },
  }
);

export const surveyAnalyticsQueue = new Queue<SurveyAnalyticsJobData>(
  "survey-analytics",
  {
    connection: sharedConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: {
        age: 24 * 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
      },
    },
  }
);

export const sampleConversationInsightsQueue =
  new Queue<SampleConversationInsightsJobData>("sample-conversation-insights", {
    connection: sharedConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
      },
    },
  });

export const emailQueue = new Queue<EmailJobData>("email", {
  connection: sharedConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});

export const imageUploadQueue = new Queue<ImageUploadJobData>("image-upload", {
  connection: sharedConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});

export const notionSyncQueue = new Queue<NotionSyncJobData>("notion-sync", {
  connection: sharedConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});

export const notionBulkOperationQueue = new Queue<NotionBulkOperationJobData>(
  "notion-bulk-operation",
  {
    connection: sharedConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
      },
    },
  }
);

export const slackSyncQueue = new Queue<SlackSyncJobData>("slack-sync", {
  connection: sharedConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});

/**
 * Queue Events for monitoring
 * Each QueueEvents needs its own dedicated connection for blocking operations
 */

export const subscriptionMonitorQueue = new Queue<SubscriptionMonitorJobData>(
  "subscription-monitor",
  {
    connection: sharedConnection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  }
);

export const conversationInsightsQueueEvents = new QueueEvents(
  "conversation-insights",
  {
    connection: createBlockingClient(),
  }
);

export const surveyAnalyticsQueueEvents = new QueueEvents("survey-analytics", {
  connection: createBlockingClient(),
});

export const sampleConversationInsightsQueueEvents = new QueueEvents(
  "sample-conversation-insights",
  {
    connection: createBlockingClient(),
  }
);

export const emailQueueEvents = new QueueEvents("email", {
  connection: createBlockingClient(),
});

export const imageUploadQueueEvents = new QueueEvents("image-upload", {
  connection: createBlockingClient(),
});

export const notionSyncQueueEvents = new QueueEvents("notion-sync", {
  connection: createBlockingClient(),
});

export const notionBulkOperationQueueEvents = new QueueEvents(
  "notion-bulk-operation",
  {
    connection: createBlockingClient(),
  }
);

export const subscriptionMonitorQueueEvents = new QueueEvents(
  "subscription-monitor",
  { connection: createBlockingClient() }
);

export const slackSyncQueueEvents = new QueueEvents("slack-sync", {
  connection: createBlockingClient(),
});

export async function enqueueConversationInsights(
  data: ConversationInsightsJobData
) {
  return await conversationInsightsQueue.add("generate-insights", data, {
    jobId: `insights-${data.conversationId}`,
    priority: 2,
  });
}

export async function enqueueSurveyAnalytics(data: SurveyAnalyticsJobData) {
  return await surveyAnalyticsQueue.add("generate-analytics", data, {
    jobId: `analytics-${data.surveyId}`,
    priority: 3,
  });
}

export async function enqueueSampleConversationInsights(
  data: SampleConversationInsightsJobData
) {
  return await sampleConversationInsightsQueue.add(
    "generate-sample-insights",
    data,
    {
      jobId: `sample-insights-${data.surveyId}-${data.conversationNumber}`,
      priority: 2,
    }
  );
}

export async function enqueueEmail(data: EmailJobData) {
  return await emailQueue.add(`send-${data.type}`, data, {
    priority: 1,
  });
}

export async function enqueueImageUpload(data: ImageUploadJobData) {
  return await imageUploadQueue.add("upload-image", data, {
    jobId: `image-upload-${data.surveyId}-${data.imageId}`,
    priority: 2,
  });
}

export async function enqueueNotionSync(data: NotionSyncJobData) {
  const jobId =
    data.syncType === "conversation" && data.targetId
      ? `notion-sync-conversation-${data.targetId}`
      : data.syncType === "analytics" && data.surveyId
        ? `notion-sync-analytics-${data.surveyId}`
        : data.syncType === "survey" && data.surveyId
          ? `notion-sync-survey-${data.surveyId}`
          : `notion-sync-full-${data.userId}-${Date.now()}`;

  return await notionSyncQueue.add(`sync-${data.syncType}`, data, {
    jobId,
    priority: 3,
  });
}

/**
 * Build BullMQ repeat options based on schedule mode
 */
function buildRepeatOptions(
  mode: NotionSyncScheduleMode,
  hourOfDay?: number
): { every?: number; cron?: string } {
  switch (mode) {
    case "hourly":
      return { every: 60 * 60 * 1000 }; // 1h
    case "every3h":
      return { every: 3 * 60 * 60 * 1000 }; // 3h
    case "every5h":
      return { every: 5 * 60 * 60 * 1000 }; // 5h
    case "daily_hour": {
      const safeHour =
        typeof hourOfDay === "number" && hourOfDay >= 0 && hourOfDay < 24
          ? hourOfDay
          : 0;
      // Run at the top of the specified hour (UTC)
      return { cron: `0 ${safeHour} * * *` };
    }
    default:
      return { every: 60 * 60 * 1000 };
  }
}

/**
 * Remove existing scheduled full-sync jobs for a user
 */
export async function clearScheduledNotionSync(userId: string) {
  await notionSyncQueue.removeJobScheduler(`notion-schedule-${userId}`);
}

/**
 * Schedule a repeating full sync for a user
 */
export async function scheduleNotionSyncRepeating(params: {
  userId: string;
  mode: NotionSyncScheduleMode;
  hourOfDay?: number;
  forceUpdate?: boolean;
}) {
  const repeat = buildRepeatOptions(params.mode, params.hourOfDay);

  return await notionSyncQueue.upsertJobScheduler(
    `notion-schedule-${params.userId}`,
    repeat,
    {
      name: "scheduled-full-sync",
      data: {
        userId: params.userId,
        syncType: "full" as const,
        forceUpdate: params.forceUpdate ?? false,
      },
      opts: {
        priority: 2,
        removeOnComplete: true,
        removeOnFail: true,
      },
    }
  );
}

/**
 * Ensure a default hourly schedule exists for the user
 */
export async function ensureDefaultScheduledSync(userId: string) {
  const schedulers = await notionSyncQueue.getJobSchedulers();
  const existing = schedulers.some(
    (s) => s.key === `notion-schedule-${userId}`
  );
  if (existing) return;
  await scheduleNotionSyncRepeating({
    userId,
    mode: "hourly",
    forceUpdate: false,
  });
}

/**
 * Remove existing scheduled Slack sync jobs for a user
 */
export async function clearScheduledSlackSync(userId: string) {
  await slackSyncQueue.removeJobScheduler(`slack-schedule-${userId}`);
}

/**
 * Schedule a repeating Slack digest for a user
 */
export async function scheduleSlackSyncRepeating(params: {
  userId: string;
  mode: SlackSyncScheduleMode;
  hourOfDay?: number;
}) {
  // If mode is 'disabled', clear the schedule
  if (params.mode === "disabled") {
    await clearScheduledSlackSync(params.userId);
    return;
  }

  const repeat = buildRepeatOptions(params.mode as NotionSyncScheduleMode, params.hourOfDay);

  return await slackSyncQueue.upsertJobScheduler(
    `slack-schedule-${params.userId}`,
    repeat,
    {
      name: "scheduled-digest",
      data: {
        userId: params.userId,
        syncType: "digest" as const,
      },
      opts: {
        priority: 2,
        removeOnComplete: true,
        removeOnFail: true,
      },
    }
  );
}

/**
 * Enqueue Slack sync job
 */
export async function enqueueSlackSync(data: SlackSyncJobData) {
  const jobId =
    data.syncType === "digest"
      ? `slack-digest-${data.userId}-${Date.now()}`
      : data.syncType === "analytics" && data.surveyId
        ? `slack-analytics-${data.surveyId}`
        : `slack-survey-${data.surveyId || "unknown"}`;

  return await slackSyncQueue.add(`sync-${data.syncType}`, data, {
    jobId,
    priority: 2,
  });
}

export async function enqueueBulkOperation(data: NotionBulkOperationJobData) {
  return await notionBulkOperationQueue.add(
    `bulk-${data.operationType}`,
    data,
    {
      jobId: `bulk-operation-${data.operationId}`,
      priority: 2, // Lower than individual syncs to allow real-time syncs to process first
    }
  );
}

export async function scheduleSubscriptionMonitor() {
  // Run every day at 10 AM UTC
  return await subscriptionMonitorQueue.upsertJobScheduler(
    "subscription-monitor-daily",
    {
      pattern: "0 10 * * *",
    },
    {
      name: "daily-check",
      data: {},
      opts: {
         removeOnComplete: true,
         removeOnFail: true,
      }
    }
  );
}

export const webhookQueue = new Queue<{
  subscriptionId: string;
  payload: WebhookPayload;
  deliveryId?: string;
}>("webhooks", {

  connection: sharedConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
  },
});

export const notificationQueue = new Queue<{
  type: "slack" | "email" | "in_app";
  userId: string;
  message: string;
  metadata?: Record<string, unknown>;
}>("notifications", {
  connection: sharedConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
  },
});

export const webhookQueueEvents = new QueueEvents("webhooks", {
  connection: createBlockingClient(),
});

export const notificationQueueEvents = new QueueEvents("notifications", {
  connection: createBlockingClient(),
});

// Helper for enqueuing webhooks
export async function enqueueWebhook(data: {
  subscriptionId: string;
  payload: WebhookPayload;
  deliveryId?: string;
}) {

  return await webhookQueue.add("deliver", data, {
    jobId: data.deliveryId, // Use deliveryId for deduplication if provided
    priority: 1,
  });
}

// Helper for enqueuing notifications
export async function enqueueNotification(data: {
  type: "slack" | "email" | "in_app";
  userId: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  return await notificationQueue.add("notify", data, {
    priority: 2,
  });
}

export async function closeQueues() {
  const { closeRedisConnections } = await import("@/lib/redis");

  await Promise.all([
    conversationInsightsQueue.close(),
    surveyAnalyticsQueue.close(),
    sampleConversationInsightsQueue.close(),
    emailQueue.close(),
    imageUploadQueue.close(),
    notionSyncQueue.close(),
    notionBulkOperationQueue.close(),
    webhookQueue.close(),
    notificationQueue.close(),
    subscriptionMonitorQueue.close(),
    slackSyncQueue.close(),
    
    conversationInsightsQueueEvents.close(),
    surveyAnalyticsQueueEvents.close(),
    sampleConversationInsightsQueueEvents.close(),
    emailQueueEvents.close(),
    imageUploadQueueEvents.close(),
    notionSyncQueueEvents.close(),
    notionBulkOperationQueueEvents.close(),
    webhookQueueEvents.close(),
    notificationQueueEvents.close(),
    subscriptionMonitorQueueEvents.close(),
    slackSyncQueueEvents.close(),
  ]);

  await closeRedisConnections();
}
