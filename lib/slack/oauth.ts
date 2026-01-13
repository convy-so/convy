 /**
 * Slack OAuth Integration
 *
 * Utilities for Slack OAuth 2.0 authentication flow
 */

import { db } from "@/db";
import { slackIntegrations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/encryption";
import { WebClient } from "@slack/web-api";

/**
 * Get Slack OAuth client for a user
 */
export async function getSlackClient(
  userId: string
): Promise<WebClient | null> {
  const [integration] = await db
    .select()
    .from(slackIntegrations)
    .where(eq(slackIntegrations.userId, userId))
    .limit(1);

  if (!integration) {
    return null;
  }

  try {
    const accessToken = decrypt(
      integration.accessToken,
      integration.accessTokenIv,
      integration.accessTokenTag
    );

    return new WebClient(accessToken);
  } catch (error) {
    console.error("Failed to decrypt Slack token:", error);
    return null;
  }
}

/**
 * Get Slack integration for a user
 */
export async function getSlackIntegration(userId: string) {
  const [integration] = await db
    .select()
    .from(slackIntegrations)
    .where(eq(slackIntegrations.userId, userId))
    .limit(1);

  return integration || null;
}

/**
 * Check if user has Slack OAuth integration
 */
export async function hasSlackIntegration(userId: string): Promise<boolean> {
  const integration = await getSlackIntegration(userId);
  return !!integration;
}

/**
 * Disconnect Slack integration
 */
export async function disconnectSlackIntegration(userId: string) {
  await db
    .delete(slackIntegrations)
    .where(eq(slackIntegrations.userId, userId));
}

/**
 * Update Slack integration settings
 */
export async function updateSlackSettings(
  userId: string,
  settings: {
    autoPostNewSurveys?: boolean;
    autoPostAnalytics?: boolean;
    autoPostOnConversation?: boolean;
    defaultChannelId?: string;
    defaultChannelName?: string;
  }
) {
  await db
    .update(slackIntegrations)
    .set({
      ...settings,
      updatedAt: new Date(),
    })
    .where(eq(slackIntegrations.userId, userId));
}
