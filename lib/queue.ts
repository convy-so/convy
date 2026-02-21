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

export interface PatternExtractionJobData {
  conversationId: string;
  surveyId: string;
  conversationType: "creation" | "response" | "sample";
  domainId?: number | null;
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
  },
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
  },
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

export const patternExtractionQueue = new Queue<PatternExtractionJobData>(
  "pattern-extraction",
  {
    connection: sharedConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: {
        age: 7 * 24 * 3600, // Keep for 7 days
        count: 5000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
      },
    },
  },
);

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

export const experimentEvaluationQueue = new Queue("experiment-evaluation", {
  connection: sharedConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 30 },
  },
});

export const conversationInsightsQueueEvents = new QueueEvents(
  "conversation-insights",
  {
    connection: createBlockingClient(),
  },
);

export const surveyAnalyticsQueueEvents = new QueueEvents("survey-analytics", {
  connection: createBlockingClient(),
});

export const sampleConversationInsightsQueueEvents = new QueueEvents(
  "sample-conversation-insights",
  {
    connection: createBlockingClient(),
  },
);

export const patternExtractionQueueEvents = new QueueEvents(
  "pattern-extraction",
  {
    connection: createBlockingClient(),
  },
);

export const emailQueueEvents = new QueueEvents("email", {
  connection: createBlockingClient(),
});

export const imageUploadQueueEvents = new QueueEvents("image-upload", {
  connection: createBlockingClient(),
});

export const experimentEvaluationQueueEvents = new QueueEvents(
  "experiment-evaluation",
  { connection: createBlockingClient() },
);

export async function enqueueConversationInsights(
  data: ConversationInsightsJobData,
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
  data: SampleConversationInsightsJobData,
) {
  return await sampleConversationInsightsQueue.add(
    "generate-sample-insights",
    data,
    {
      jobId: `sample-insights-${data.surveyId}-${data.conversationNumber}`,
      priority: 2,
    },
  );
}

export async function enqueuePatternExtraction(data: PatternExtractionJobData) {
  return await patternExtractionQueue.add("extract-patterns", data, {
    jobId: `pattern-extraction-${data.conversationId}`,
    priority: 1, // Lower priority - can run after insights
  });
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

/**
 * Schedule nightly experiment evaluation (3 AM UTC)
 */
export async function scheduleExperimentEvaluation() {
  return await experimentEvaluationQueue.upsertJobScheduler(
    "experiment-evaluation-nightly",
    { pattern: "0 3 * * *" },
    {
      name: "nightly-evaluation",
      data: {},
      opts: { removeOnComplete: true, removeOnFail: true },
    },
  );
}

export const notificationQueue = new Queue<{
  type: "email" | "in_app";
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

export const notificationQueueEvents = new QueueEvents("notifications", {
  connection: createBlockingClient(),
});

// Helper for enqueuing notifications
export async function enqueueNotification(data: {
  type: "email" | "in_app";
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
    patternExtractionQueue.close(),
    emailQueue.close(),
    imageUploadQueue.close(),
    notificationQueue.close(),
    experimentEvaluationQueue.close(),

    conversationInsightsQueueEvents.close(),
    surveyAnalyticsQueueEvents.close(),
    sampleConversationInsightsQueueEvents.close(),
    patternExtractionQueueEvents.close(),
    emailQueueEvents.close(),
    imageUploadQueueEvents.close(),
    notificationQueueEvents.close(),
    experimentEvaluationQueueEvents.close(),
  ]);

  await closeRedisConnections();
}
