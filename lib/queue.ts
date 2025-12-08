import "server-only";

import { Queue, QueueEvents } from "bullmq";
import { getRedisClient, createBlockingClient } from "@/lib/redis";

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
  type: "verification" | "password-reset";
  email: string;
  url: string;
  name?: string | null;
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

/**
 * Queue Events for monitoring
 * Each QueueEvents needs its own dedicated connection for blocking operations
 */

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
    conversationInsightsQueueEvents.close(),
    surveyAnalyticsQueueEvents.close(),
    sampleConversationInsightsQueueEvents.close(),
    emailQueueEvents.close(),
    imageUploadQueueEvents.close(),
    notionSyncQueueEvents.close(),
    notionBulkOperationQueueEvents.close(),
  ]);

  await closeRedisConnections();
}
