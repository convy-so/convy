import { Job, Worker } from "bullmq";
import { eq, and, gte } from "drizzle-orm";
import { getRedisClient } from "@/lib/redis";
import { db } from "@/db";
import {
  slackIntegrations,
  slackPosts,
  surveys,
  surveyConversations,
  surveyAnalytics,
} from "@/db/schema";
import { getSlackIntegration } from "@/lib/slack/oauth";
import { postToSlackChannel } from "@/lib/slack/client";
import {
  formatConversationDigestMessage,
  formatAnalyticsUpdateMessage,
  formatSurveyCreatedMessage,
} from "@/lib/slack/messages";
import { SlackSyncJobData } from "@/lib/queue";

const connection = getRedisClient();

/**
 * Slack Sync Worker
 * Handles scheduled digest posts and immediate posts for analytics/survey creation
 */
export const slackSyncWorker = new Worker<SlackSyncJobData>(
  "slack-sync",
  async (job: Job<SlackSyncJobData>) => {
    const { userId, surveyId, syncType, targetId } = job.data;

    console.log(
      `[Slack Sync Worker] Processing job ${job.id} for user ${userId}, type: ${syncType}`
    );

    await job.updateProgress(10);

    // Get Slack integration
    const integration = await getSlackIntegration(userId);

    if (!integration || !integration.defaultChannelId) {
      console.warn(`[Slack Sync Worker] No Slack integration or default channel for user ${userId}`);
      return { skipped: true, reason: "No Slack integration configured" };
    }

    await job.updateProgress(20);

    if (syncType === "digest") {
      // Handle digest post - batch multiple conversations
      return await handleDigestPost(job, userId, integration);
    } else if (syncType === "analytics" && surveyId) {
      // Handle analytics update post
      return await handleAnalyticsPost(job, userId, surveyId, integration);
    } else if (syncType === "survey_created" && surveyId) {
      // Handle survey created post
      return await handleSurveyCreatedPost(job, userId, surveyId, integration);
    }

    return { skipped: true, reason: "Unknown sync type" };
  },
  {
    connection,
    concurrency: 2,
  }
);

/**
 * Handle digest post - collect and batch new conversations
 */
async function handleDigestPost(
  job: Job<SlackSyncJobData>,
  userId: string,
  integration: Awaited<ReturnType<typeof getSlackIntegration>>
) {
  if (!integration || !integration.defaultChannelId) {
    console.warn(`[Slack Sync Worker] No default channel for user ${userId}`);
    return { skipped: true, reason: "No default channel" };
  }

  await job.updateProgress(30);

  // Get last scheduled sync time
  const lastSyncTime = integration.lastScheduledSyncAt || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default to 24h ago

  // Find all conversations completed since last sync
  const newConversations = await db
    .select({
      id: surveyConversations.id,
      surveyId: surveyConversations.surveyId,
      surveyTitle: surveys.title,
      createdAt: surveyConversations.createdAt,
    })
    .from(surveyConversations)
    .innerJoin(surveys, eq(surveys.id, surveyConversations.surveyId))
    .where(
      and(
        eq(surveys.userId, userId),
        eq(surveyConversations.completed, true),
        gte(surveyConversations.updatedAt, lastSyncTime)
      )
    );

  await job.updateProgress(50);

  if (newConversations.length === 0) {
    console.log(`[Slack Sync Worker] No new conversations since last sync for user ${userId}`);
    
    // Update last sync time even if no new conversations
    await db
      .update(slackIntegrations)
      .set({ lastScheduledSyncAt: new Date() })
      .where(eq(slackIntegrations.userId, userId));

    return { success: true, conversationCount: 0, message: "No new conversations" };
  }

  // Group by survey
  const surveyBreakdown = newConversations.reduce((acc, conv) => {
    const existing = acc.find((s) => s.surveyId === conv.surveyId);
    if (existing) {
      existing.count++;
    } else {
      acc.push({
        surveyId: conv.surveyId,
        surveyTitle: conv.surveyTitle,
        count: 1,
      });
    }
    return acc;
  }, [] as Array<{ surveyId: string; surveyTitle: string; count: number }>);

  await job.updateProgress(70);

  // Format digest message
  const timeframe = getTimeframeString(integration.syncScheduleMode || "hourly");
  const message = formatConversationDigestMessage({
    totalNewConversations: newConversations.length,
    surveyBreakdown,
    timeframe,
  });

  // Create post record
  const postId = crypto.randomUUID();
  await db.insert(slackPosts).values({
    id: postId,
    userId,
    slackIntegrationId: integration.id!,
    postType: "digest",
    channelId: integration.defaultChannelId!,
    channelName: integration.defaultChannelName || null,
    messageContent: message.text,
    status: "pending",
  });

  await job.updateProgress(80);

  try {
    // Post to Slack
    const result = await postToSlackChannel(userId, integration.defaultChannelId, {
      text: message.text,
      blocks: message.blocks,
    });

    // Update post record with success
    await db
      .update(slackPosts)
      .set({
        messageTs: result.ts || null,
        status: "success",
      })
      .where(eq(slackPosts.id, postId));

    // Update last sync time and last posted time
    await db
      .update(slackIntegrations)
      .set({
        lastScheduledSyncAt: new Date(),
        lastPostedAt: new Date(),
      })
      .where(eq(slackIntegrations.userId, userId));

    console.log(
      `[Slack Sync Worker] Posted digest: ${newConversations.length} conversations across ${surveyBreakdown.length} surveys`
    );

    await job.updateProgress(100);

    return {
      success: true,
      conversationCount: newConversations.length,
      surveyCount: surveyBreakdown.length,
    };
  } catch (error) {
    console.error("[Slack Sync Worker] Failed to post digest:", error);

    // Update post record with failure
    await db
      .update(slackPosts)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message.substring(0, 500) : "Unknown error",
      })
      .where(eq(slackPosts.id, postId));

    throw error;
  }
}

/**
 * Handle analytics update post
 */
async function handleAnalyticsPost(
  job: Job<SlackSyncJobData>,
  userId: string,
  surveyId: string,
  integration: Awaited<ReturnType<typeof getSlackIntegration>>
) {
  if (!integration || !integration.defaultChannelId) {
    console.warn(`[Slack Sync Worker] No default channel for user ${userId}`);
    return { skipped: true, reason: "No default channel" };
  }

  await job.updateProgress(40);

  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) {
    console.warn(`[Slack Sync Worker] Survey not found: ${surveyId}`);
    return { skipped: true, reason: "Survey not found" };
  }

  const [analytics] = await db
    .select()
    .from(surveyAnalytics)
    .where(eq(surveyAnalytics.surveyId, surveyId));

  if (!analytics) {
    console.warn(`[Slack Sync Worker] Analytics not found: ${surveyId}`);
    return { skipped: true, reason: "Analytics not found" };
  }

  await job.updateProgress(60);

  const message = formatAnalyticsUpdateMessage({
    surveyTitle: survey.title,
    analytics,
  });

  const postId = crypto.randomUUID();
  await db.insert(slackPosts).values({
    id: postId,
    userId,
    slackIntegrationId: integration.id!,
    postType: "analytics_update",
    surveyId,
    channelId: integration.defaultChannelId!,
    channelName: integration.defaultChannelName || null,
    messageContent: message.text,
    status: "pending",
  });

  await job.updateProgress(80);

  try {
    const result = await postToSlackChannel(userId, integration.defaultChannelId, {
      text: message.text,
      blocks: message.blocks,
    });

    await db
      .update(slackPosts)
      .set({
        messageTs: result.ts || null,
        status: "success",
      })
      .where(eq(slackPosts.id, postId));

    await db
      .update(slackIntegrations)
      .set({ lastPostedAt: new Date() })
      .where(eq(slackIntegrations.userId, userId));

    console.log(`[Slack Sync Worker] Posted analytics update for survey ${surveyId}`);

    await job.updateProgress(100);

    return { success: true, surveyId };
  } catch (error) {
    console.error("[Slack Sync Worker] Failed to post analytics:", error);

    await db
      .update(slackPosts)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message.substring(0, 500) : "Unknown error",
      })
      .where(eq(slackPosts.id, postId));

    throw error;
  }
}

/**
 * Handle survey created post
 */
async function handleSurveyCreatedPost(
  job: Job<SlackSyncJobData>,
  userId: string,
  surveyId: string,
  integration: Awaited<ReturnType<typeof getSlackIntegration>>
) {
  if (!integration || !integration.defaultChannelId) {
    console.warn(`[Slack Sync Worker] No default channel for user ${userId}`);
    return { skipped: true, reason: "No default channel" };
  }

  await job.updateProgress(40);

  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) {
    console.warn(`[Slack Sync Worker] Survey not found: ${surveyId}`);
    return { skipped: true, reason: "Survey not found" };
  }

  await job.updateProgress(60);

  const message = formatSurveyCreatedMessage(survey);

  const postId = crypto.randomUUID();
  await db.insert(slackPosts).values({
    id: postId,
    userId,
    slackIntegrationId: integration.id!,
    postType: "survey_created",
    surveyId,
    channelId: integration.defaultChannelId!,
    channelName: integration.defaultChannelName || null,
    messageContent: message.text,
    status: "pending",
  });

  await job.updateProgress(80);

  try {
    const result = await postToSlackChannel(userId, integration.defaultChannelId, {
      text: message.text,
      blocks: message.blocks,
    });

    await db
      .update(slackPosts)
      .set({
        messageTs: result.ts || null,
        status: "success",
      })
      .where(eq(slackPosts.id, postId));

    await db
      .update(slackIntegrations)
      .set({ lastPostedAt: new Date() })
      .where(eq(slackIntegrations.userId, userId));

    console.log(`[Slack Sync Worker] Posted survey created for ${surveyId}`);

    await job.updateProgress(100);

    return { success: true, surveyId };
  } catch (error) {
    console.error("[Slack Sync Worker] Failed to post survey created:", error);

    await db
      .update(slackPosts)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message.substring(0, 500) : "Unknown error",
      })
      .where(eq(slackPosts.id, postId));

    throw error;
  }
}

/**
 * Get human-readable timeframe string
 */
function getTimeframeString(mode: string): string {
  switch (mode) {
    case "hourly":
      return "in the last hour";
    case "every3h":
      return "in the last 3 hours";
    case "every5h":
      return "in the last 5 hours";
    case "daily_hour":
      return "in the last 24 hours";
    default:
      return "recently";
  }
}

slackSyncWorker.on("completed", (job) => {
  console.log(`[Slack Sync Worker] Job ${job.id} completed`);
});

slackSyncWorker.on("failed", (job, err) => {
  console.error(`[Slack Sync Worker] Job ${job?.id} failed:`, err.message);
});

export default slackSyncWorker;
