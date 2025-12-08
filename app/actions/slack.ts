"use server";

/**
 * Slack Integration Actions
 *
 * Server actions for managing Slack OAuth integration and posting survey data
 */

import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import {
  slackIntegrations,
  slackPosts,
  surveys,
  surveyAnalytics,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import {
  getSlackIntegration,
  hasSlackIntegration,
  disconnectSlackIntegration,
  updateSlackSettings,
} from "@/lib/slack/oauth";
import { getSlackChannels, postToSlackChannel } from "@/lib/slack/client";
import {
  formatSurveyCreatedMessage,
  formatNewConversationMessage,
  formatAnalyticsUpdateMessage,
  formatManualPostMessage,
} from "@/lib/slack/messages";

/**
 * Get Slack integration status
 */
export async function getSlackIntegrationStatus() {
  try {
    const session = await getVerifiedSession();

    const integration = await getSlackIntegration(session.user.id);

    if (!integration) {
      return {
        success: true,
        data: { connected: false },
      };
    }

    return {
      success: true,
      data: {
        connected: true,
        teamName: integration.teamName,
        teamId: integration.teamId,
        teamIcon: integration.teamIcon,
        autoPostNewSurveys: integration.autoPostNewSurveys,
        autoPostAnalytics: integration.autoPostAnalytics,
        autoPostOnConversation: integration.autoPostOnConversation,
        defaultChannelId: integration.defaultChannelId,
        defaultChannelName: integration.defaultChannelName,
        lastPostedAt: integration.lastPostedAt,
      },
    };
  } catch (error) {
    console.error("Error getting Slack status:", error);
    return {
      success: false,
      error: "Failed to get Slack status",
    };
  }
}

/**
 * Disconnect Slack integration
 */
export async function disconnectSlack() {
  try {
    const session = await getVerifiedSession();

    await disconnectSlackIntegration(session.user.id);

    return {
      success: true,
      message: "Slack integration disconnected",
    };
  } catch (error) {
    console.error("Error disconnecting Slack:", error);
    return {
      success: false,
      error: "Failed to disconnect Slack",
    };
  }
}

/**
 * Get Slack channels
 */
export async function getSlackChannelList() {
  try {
    const session = await getVerifiedSession();

    const channels = await getSlackChannels(session.user.id);

    return {
      success: true,
      data: channels,
    };
  } catch (error) {
    console.error("Error getting Slack channels:", error);
    return {
      success: false,
      error: "Failed to get channels",
      data: [],
    };
  }
}

/**
 * Update Slack settings
 */
export async function updateSlackIntegrationSettings(settings: {
  autoPostNewSurveys?: boolean;
  autoPostAnalytics?: boolean;
  autoPostOnConversation?: boolean;
  defaultChannelId?: string;
  defaultChannelName?: string;
}) {
  try {
    const session = await getVerifiedSession();

    await updateSlackSettings(session.user.id, settings);

    return {
      success: true,
      message: "Settings updated",
    };
  } catch (error) {
    console.error("Error updating Slack settings:", error);
    return {
      success: false,
      error: "Failed to update settings",
    };
  }
}

/**
 * Post survey to Slack manually
 */
export async function postSurveyToSlack(surveyId: string, channelId: string) {
  try {
    const session = await getVerifiedSession();

    // Verify survey ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(
        and(eq(surveys.id, surveyId), eq(surveys.userId, session.user.id))
      );

    if (!survey) {
      return {
        success: false,
        error: "Survey not found",
      };
    }

    // Format message
    const message = formatSurveyCreatedMessage(survey);

    // Post to Slack
    const result = await postToSlackChannel(session.user.id, channelId, {
      text: message.text,
      blocks: message.blocks,
    });

    // Record post
    await db.insert(slackPosts).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      slackIntegrationId: (await getSlackIntegration(session.user.id))!.id,
      postType: "manual",
      surveyId,
      channelId,
      messageTs: result.ts || null,
      messageContent: message.text,
      status: "success",
    });

    // Update last posted
    await db
      .update(slackIntegrations)
      .set({ lastPostedAt: new Date() })
      .where(eq(slackIntegrations.userId, session.user.id));

    return {
      success: true,
      message: "Posted to Slack successfully",
    };
  } catch (error) {
    console.error("Error posting to Slack:", error);
    return {
      success: false,
      error: "Failed to post to Slack",
    };
  }
}

/**
 * Post analytics to Slack
 */
export async function postAnalyticsToSlack(
  surveyId: string,
  channelId: string
) {
  try {
    const session = await getVerifiedSession();

    // Verify survey ownership
    const [survey] = await db
      .select()
      .from(surveys)
      .where(
        and(eq(surveys.id, surveyId), eq(surveys.userId, session.user.id))
      );

    if (!survey) {
      return {
        success: false,
        error: "Survey not found",
      };
    }

    // Get analytics
    const [analytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    if (!analytics) {
      return {
        success: false,
        error: "Analytics not yet available",
      };
    }

    // Format message
    const message = formatAnalyticsUpdateMessage({
      surveyTitle: survey.title,
      analytics,
    });

    // Post to Slack
    const result = await postToSlackChannel(session.user.id, channelId, {
      text: message.text,
      blocks: message.blocks,
    });

    // Record post
    await db.insert(slackPosts).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      slackIntegrationId: (await getSlackIntegration(session.user.id))!.id,
      postType: "analytics_update",
      surveyId,
      channelId,
      messageTs: result.ts || null,
      messageContent: message.text,
      status: "success",
    });

    // Update last posted
    await db
      .update(slackIntegrations)
      .set({ lastPostedAt: new Date() })
      .where(eq(slackIntegrations.userId, session.user.id));

    return {
      success: true,
      message: "Analytics posted to Slack successfully",
    };
  } catch (error) {
    console.error("Error posting analytics to Slack:", error);
    return {
      success: false,
      error: "Failed to post analytics",
    };
  }
}

/**
 * Post custom message to Slack
 */
export async function postCustomMessageToSlack(data: {
  channelId: string;
  title: string;
  content: string;
  fields?: Array<{ name: string; value: string }>;
}) {
  try {
    const session = await getVerifiedSession();

    // Format message
    const message = formatManualPostMessage(data);

    // Post to Slack
    const result = await postToSlackChannel(session.user.id, data.channelId, {
      text: message.text,
      blocks: message.blocks,
    });

    // Record post
    await db.insert(slackPosts).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      slackIntegrationId: (await getSlackIntegration(session.user.id))!.id,
      postType: "manual",
      channelId: data.channelId,
      messageTs: result.ts || null,
      messageContent: message.text,
      status: "success",
    });

    return {
      success: true,
      message: "Posted to Slack successfully",
    };
  } catch (error) {
    console.error("Error posting custom message to Slack:", error);
    return {
      success: false,
      error: "Failed to post to Slack",
    };
  }
}

/**
 * Get Slack post history
 */
export async function getSlackPostHistory(limit = 50) {
  try {
    const session = await getVerifiedSession();

    const posts = await db
      .select({
        id: slackPosts.id,
        postType: slackPosts.postType,
        channelId: slackPosts.channelId,
        channelName: slackPosts.channelName,
        messageContent: slackPosts.messageContent,
        status: slackPosts.status,
        error: slackPosts.error,
        createdAt: slackPosts.createdAt,
      })
      .from(slackPosts)
      .where(eq(slackPosts.userId, session.user.id))
      .orderBy(desc(slackPosts.createdAt))
      .limit(limit);

    return {
      success: true,
      data: posts,
    };
  } catch (error) {
    console.error("Error getting Slack post history:", error);
    return {
      success: false,
      error: "Failed to get post history",
      data: [],
    };
  }
}

/**
 * Auto-post functions (called by workers)
 */
export async function autoPostSurveyCreated(userId: string, surveyId: string) {
  try {
    const integration = await getSlackIntegration(userId);

    if (
      !integration ||
      !integration.autoPostNewSurveys ||
      !integration.defaultChannelId
    ) {
      return; // Auto-post not enabled or no default channel
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) return;

    const message = formatSurveyCreatedMessage(survey);

    const result = await postToSlackChannel(
      userId,
      integration.defaultChannelId,
      {
        text: message.text,
        blocks: message.blocks,
      }
    );

    await db.insert(slackPosts).values({
      id: crypto.randomUUID(),
      userId,
      slackIntegrationId: integration.id,
      postType: "survey_created",
      surveyId,
      channelId: integration.defaultChannelId,
      channelName: integration.defaultChannelName || null,
      messageTs: result.ts || null,
      messageContent: message.text,
      status: "success",
    });

    await db
      .update(slackIntegrations)
      .set({ lastPostedAt: new Date() })
      .where(eq(slackIntegrations.userId, userId));
  } catch (error) {
    console.error("Error auto-posting survey:", error);
  }
}

export async function autoPostNewConversation(
  userId: string,
  surveyId: string,
  conversationId: string
) {
  try {
    const integration = await getSlackIntegration(userId);

    if (
      !integration ||
      !integration.autoPostOnConversation ||
      !integration.defaultChannelId
    ) {
      return;
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) return;

    const message = formatNewConversationMessage({
      surveyTitle: survey.title,
      conversationId,
      participantId: "unknown",
      totalConversations: survey.currentParticipants,
    });

    const result = await postToSlackChannel(
      userId,
      integration.defaultChannelId,
      {
        text: message.text,
        blocks: message.blocks,
      }
    );

    await db.insert(slackPosts).values({
      id: crypto.randomUUID(),
      userId,
      slackIntegrationId: integration.id,
      postType: "new_conversation",
      surveyId,
      conversationId,
      channelId: integration.defaultChannelId,
      channelName: integration.defaultChannelName || null,
      messageTs: result.ts || null,
      messageContent: message.text,
      status: "success",
    });
  } catch (error) {
    console.error("Error auto-posting conversation:", error);
  }
}

export async function autoPostAnalyticsUpdate(
  userId: string,
  surveyId: string
) {
  try {
    const integration = await getSlackIntegration(userId);

    if (
      !integration ||
      !integration.autoPostAnalytics ||
      !integration.defaultChannelId
    ) {
      return;
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) return;

    const [analytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    if (!analytics) return;

    const message = formatAnalyticsUpdateMessage({
      surveyTitle: survey.title,
      analytics,
    });

    const result = await postToSlackChannel(
      userId,
      integration.defaultChannelId,
      {
        text: message.text,
        blocks: message.blocks,
      }
    );

    await db.insert(slackPosts).values({
      id: crypto.randomUUID(),
      userId,
      slackIntegrationId: integration.id,
      postType: "analytics_update",
      surveyId,
      channelId: integration.defaultChannelId,
      channelName: integration.defaultChannelName || null,
      messageTs: result.ts || null,
      messageContent: message.text,
      status: "success",
    });
  } catch (error) {
    console.error("Error auto-posting analytics:", error);
  }
}
