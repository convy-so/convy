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
  disconnectSlackIntegration,
  updateSlackSettings,
} from "@/lib/slack/oauth";
import { getSlackChannels, postToSlackChannel } from "@/lib/slack/client";
import {
  getWorkspaceOwnerId,
  isWorkspaceOwner,
  getSurveyAccessLevel,
} from "@/lib/workspace-access";
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
    const activeOrgId = session.session.activeOrganizationId;
    let targetUserId = session.user.id;

    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    const integration = await getSlackIntegration(targetUserId);

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
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      const isOwner = await isWorkspaceOwner(session.user.id, activeOrgId);
      if (!isOwner) {
        return { success: false, error: "Only workspace owner can manage integrations" };
      }
    }

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
    const activeOrgId = session.session.activeOrganizationId;
    let targetUserId = session.user.id;

    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    const channels = await getSlackChannels(targetUserId);

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
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      const isOwner = await isWorkspaceOwner(session.user.id, activeOrgId);
      if (!isOwner) {
        return { success: false, error: "Only workspace owner can manage integrations" };
      }
    }

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
  let session: Awaited<ReturnType<typeof getVerifiedSession>> | undefined;
  try {
    session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    // Verify survey access
    const access = await getSurveyAccessLevel(session.user.id, surveyId);
    if (access === "none") {
      return { success: false, error: "Unauthorized" };
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
       return { success: false, error: "Survey not found" };
    }

    // Format message
    const message = formatSurveyCreatedMessage(survey);

    // Create post record first
    const postId = crypto.randomUUID();
    
    let targetUserId = session.user.id;
    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    const integration = await getSlackIntegration(targetUserId);
    if (!integration) {
      return {
        success: false,
        error: "Slack integration not found",
      };
    }

    await db.insert(slackPosts).values({
      id: postId,
      userId: session.user.id,
      slackIntegrationId: integration.id,
      postType: "manual",
      surveyId,
      channelId,
      messageContent: message.text,
      status: "pending",
    });

    // Post to Slack
    const result = await postToSlackChannel(targetUserId, channelId, {
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

    // Update post record with failure if we created one
    if (session) {
      try {
        const [lastPost] = await db
          .select()
          .from(slackPosts)
          .where(
            and(
              eq(slackPosts.userId, session.user.id),
              eq(slackPosts.surveyId, surveyId),
              eq(slackPosts.postType, "manual")
            )
          )
          .orderBy(desc(slackPosts.createdAt))
          .limit(1);

        if (lastPost && lastPost.status === "pending") {
          await db
            .update(slackPosts)
            .set({
              status: "failed",
              error:
                error instanceof Error
                  ? error.message.substring(0, 500)
                  : "Unknown error",
            })
            .where(eq(slackPosts.id, lastPost.id));
        }
      } catch (dbError) {
        console.error("Failed to update post record:", dbError);
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to post to Slack",
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
  let session: Awaited<ReturnType<typeof getVerifiedSession>> | undefined;
  try {
    session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    // Verify survey access
    const access = await getSurveyAccessLevel(session.user.id, surveyId);
    if (access === "none") {
      return { success: false, error: "Unauthorized" };
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));
    
    if (!survey) {
       return { success: false, error: "Survey not found" };
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

    // Create post record first
    const postId = crypto.randomUUID();
    
    let targetUserId = session.user.id;
    if (activeOrgId) {
      const ownerId = await getWorkspaceOwnerId(activeOrgId);
      if (ownerId) targetUserId = ownerId;
    }

    const integration = await getSlackIntegration(targetUserId);
    if (!integration) {
      return {
        success: false,
        error: "Slack integration not found",
      };
    }

    await db.insert(slackPosts).values({
      id: postId,
      userId: session.user.id,
      slackIntegrationId: integration.id,
      postType: "analytics_update",
      surveyId,
      channelId,
      messageContent: message.text,
      status: "pending",
    });

    const result = await postToSlackChannel(targetUserId, channelId, {
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

    // Update post record with failure if we created one
    if (session) {
      try {
        const [lastPost] = await db
          .select()
          .from(slackPosts)
          .where(
            and(
              eq(slackPosts.userId, session.user.id),
              eq(slackPosts.surveyId, surveyId),
              eq(slackPosts.postType, "analytics_update")
            )
          )
          .orderBy(desc(slackPosts.createdAt))
          .limit(1);

        if (lastPost && lastPost.status === "pending") {
          await db
            .update(slackPosts)
            .set({
              status: "failed",
              error:
                error instanceof Error
                  ? error.message.substring(0, 500)
                  : "Unknown error",
            })
            .where(eq(slackPosts.id, lastPost.id));
        }
      } catch (dbError) {
        console.error("Failed to update post record:", dbError);
      }
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to post analytics",
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
  let postId: string | null = null;

  try {
    const session = await getVerifiedSession();

    const message = formatManualPostMessage(data);

    postId = crypto.randomUUID();
    const integration = await getSlackIntegration(session.user.id);
    if (!integration) {
      return {
        success: false,
        error: "Slack integration not found",
      };
    }

    await db.insert(slackPosts).values({
      id: postId,
      userId: session.user.id,
      slackIntegrationId: integration.id,
      postType: "manual",
      channelId: data.channelId,
      messageContent: message.text,
      status: "pending",
    });

    // Post to Slack
    const result = await postToSlackChannel(session.user.id, data.channelId, {
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

    return {
      success: true,
      message: "Posted to Slack successfully",
    };
  } catch (error) {
    console.error("Error posting custom message to Slack:", error);

    // Update post record with failure if we created one
    if (postId) {
      try {
        await db
          .update(slackPosts)
          .set({
            status: "failed",
            error:
              error instanceof Error
                ? error.message.substring(0, 500)
                : "Unknown error",
          })
          .where(eq(slackPosts.id, postId));
      } catch (dbError) {
        console.error("Failed to update post record:", dbError);
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to post to Slack",
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
 * Auto-post functions (called by workers/events)
 * Production-ready with proper error handling and logging
 * Optimized to reduce duplicate database queries
 */
export async function autoPostSurveyCreated(userId: string, surveyId: string) {
  // Cache integration to avoid duplicate queries in error handler
  let integration: Awaited<ReturnType<typeof getSlackIntegration>> | null =
    null;
  let postId: string | null = null;

  try {
    integration = await getSlackIntegration(userId);

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

    if (!survey) {
      console.warn(`[Slack Auto-Post] Survey not found: ${surveyId}`);
      return;
    }

    const message = formatSurveyCreatedMessage(survey);

    // Create post record first (with pending status)
    postId = crypto.randomUUID();
    await db.insert(slackPosts).values({
      id: postId,
      userId,
      slackIntegrationId: integration.id,
      postType: "survey_created",
      surveyId,
      channelId: integration.defaultChannelId,
      channelName: integration.defaultChannelName || null,
      messageContent: message.text,
      status: "pending",
    });

    const result = await postToSlackChannel(
      userId,
      integration.defaultChannelId,
      {
        text: message.text,
        blocks: message.blocks,
      }
    );

    // Update post record with success
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

    console.log(
      `[Slack Auto-Post] Survey created post successful: ${surveyId}`
    );
  } catch (error) {
    console.error("[Slack Auto-Post] Error posting survey:", error);

    // Update post record with failure - use cached integration
    if (postId) {
      try {
        await db
          .update(slackPosts)
          .set({
            status: "failed",
            error:
              error instanceof Error
                ? error.message.substring(0, 500)
                : "Unknown error",
          })
          .where(eq(slackPosts.id, postId));
      } catch (dbError) {
        console.error(
          "[Slack Auto-Post] Failed to update post record:",
          dbError
        );
      }
    } else if (integration) {
      // Create failed post record using cached integration (no duplicate query)
      try {
        await db.insert(slackPosts).values({
          id: crypto.randomUUID(),
          userId,
          slackIntegrationId: integration.id,
          postType: "survey_created",
          surveyId,
          channelId: integration.defaultChannelId || "",
          channelName: integration.defaultChannelName || null,
          status: "failed",
          error:
            error instanceof Error
              ? error.message.substring(0, 500)
              : "Unknown error",
        });
      } catch (dbError) {
        console.error("[Slack Auto-Post] Failed to record error:", dbError);
      }
    }
  }
}

export async function autoPostNewConversation(
  userId: string,
  surveyId: string,
  conversationId: string
) {
  // Cache integration to avoid duplicate queries in error handler
  let integration: Awaited<ReturnType<typeof getSlackIntegration>> | null =
    null;
  let postId: string | null = null;

  try {
    integration = await getSlackIntegration(userId);

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

    if (!survey) {
      console.warn(`[Slack Auto-Post] Survey not found: ${surveyId}`);
      return;
    }

    const message = formatNewConversationMessage({
      surveyTitle: survey.title,
      conversationId,
      participantId: "unknown",
      totalConversations: survey.currentParticipants,
    });

    // Create post record first
    postId = crypto.randomUUID();
    await db.insert(slackPosts).values({
      id: postId,
      userId,
      slackIntegrationId: integration.id,
      postType: "new_conversation",
      surveyId,
      conversationId,
      channelId: integration.defaultChannelId,
      channelName: integration.defaultChannelName || null,
      messageContent: message.text,
      status: "pending",
    });

    const result = await postToSlackChannel(
      userId,
      integration.defaultChannelId,
      {
        text: message.text,
        blocks: message.blocks,
      }
    );

    // Update post record with success
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

    console.log(
      `[Slack Auto-Post] New conversation post successful: ${conversationId}`
    );
  } catch (error) {
    console.error("[Slack Auto-Post] Error posting conversation:", error);

    // Update post record with failure - use cached integration
    if (postId) {
      try {
        await db
          .update(slackPosts)
          .set({
            status: "failed",
            error:
              error instanceof Error
                ? error.message.substring(0, 500)
                : "Unknown error",
          })
          .where(eq(slackPosts.id, postId));
      } catch (dbError) {
        console.error(
          "[Slack Auto-Post] Failed to update post record:",
          dbError
        );
      }
    } else if (integration) {
      // Use cached integration (no duplicate query)
      try {
        await db.insert(slackPosts).values({
          id: crypto.randomUUID(),
          userId,
          slackIntegrationId: integration.id,
          postType: "new_conversation",
          surveyId,
          conversationId,
          channelId: integration.defaultChannelId || "",
          channelName: integration.defaultChannelName || null,
          status: "failed",
          error:
            error instanceof Error
              ? error.message.substring(0, 500)
              : "Unknown error",
        });
      } catch (dbError) {
        console.error("[Slack Auto-Post] Failed to record error:", dbError);
      }
    }
  }
}

export async function autoPostAnalyticsUpdate(
  userId: string,
  surveyId: string
) {
  // Cache integration to avoid duplicate queries in error handler
  let integration: Awaited<ReturnType<typeof getSlackIntegration>> | null =
    null;
  let postId: string | null = null;

  try {
    integration = await getSlackIntegration(userId);

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

    if (!survey) {
      console.warn(`[Slack Auto-Post] Survey not found: ${surveyId}`);
      return;
    }

    const [analytics] = await db
      .select()
      .from(surveyAnalytics)
      .where(eq(surveyAnalytics.surveyId, surveyId));

    if (!analytics) {
      console.warn(`[Slack Auto-Post] Analytics not found: ${surveyId}`);
      return;
    }

    const message = formatAnalyticsUpdateMessage({
      surveyTitle: survey.title,
      analytics,
    });

    // Create post record first
    postId = crypto.randomUUID();
    await db.insert(slackPosts).values({
      id: postId,
      userId,
      slackIntegrationId: integration.id,
      postType: "analytics_update",
      surveyId,
      channelId: integration.defaultChannelId,
      channelName: integration.defaultChannelName || null,
      messageContent: message.text,
      status: "pending",
    });

    const result = await postToSlackChannel(
      userId,
      integration.defaultChannelId,
      {
        text: message.text,
        blocks: message.blocks,
      }
    );

    // Update post record with success
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

    console.log(
      `[Slack Auto-Post] Analytics update post successful: ${surveyId}`
    );
  } catch (error) {
    console.error("[Slack Auto-Post] Error posting analytics:", error);

    // Update post record with failure - use cached integration
    if (postId) {
      try {
        await db
          .update(slackPosts)
          .set({
            status: "failed",
            error:
              error instanceof Error
                ? error.message.substring(0, 500)
                : "Unknown error",
          })
          .where(eq(slackPosts.id, postId));
      } catch (dbError) {
        console.error(
          "[Slack Auto-Post] Failed to update post record:",
          dbError
        );
      }
    } else if (integration) {
      // Use cached integration (no duplicate query)
      try {
        await db.insert(slackPosts).values({
          id: crypto.randomUUID(),
          userId,
          slackIntegrationId: integration.id,
          postType: "analytics_update",
          surveyId,
          channelId: integration.defaultChannelId || "",
          channelName: integration.defaultChannelName || null,
          status: "failed",
          error:
            error instanceof Error
              ? error.message.substring(0, 500)
              : "Unknown error",
        });
      } catch (dbError) {
        console.error("[Slack Auto-Post] Failed to record error:", dbError);
      }
    }
  }
}
