/**
 * Slack Client Manager
 *
 * Manages Slack Web API clients with OAuth tokens
 * Includes rate limiting and retry logic
 */

import { WebClient, Block, KnownBlock } from "@slack/web-api";
import { getSlackClient } from "./oauth";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

// Rate limiter for Slack API calls
// Slack allows 1+ requests per second per method (Tier 3)
// We'll use a conservative limit: 50 requests per minute per user
const slackRateLimiter = new Ratelimit({
  redis: new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  }),
  limiter: Ratelimit.slidingWindow(50, "1 m"),
  analytics: true,
  prefix: "@upstash/ratelimit/slack",
});

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on certain errors
      if (
        error instanceof Error &&
        (error.message.includes("invalid_auth") ||
          error.message.includes("account_inactive") ||
          error.message.includes("not_authed"))
      ) {
        throw error;
      }

      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(
          `[Slack] Retry attempt ${i + 1}/${maxRetries} after ${delay}ms:`,
          error instanceof Error ? error.message : "Unknown error"
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError!;
}

/**
 * Post a message to a Slack channel
 * Includes rate limiting and retry logic
 */
export async function postToSlackChannel(
  userId: string,
  channelId: string,
  options: {
    text: string;
    blocks?: (Block | KnownBlock)[];
    thread_ts?: string;
  }
) {
  // Rate limit check
  const rateLimitResult = await slackRateLimiter.limit(`user:${userId}`);

  if (!rateLimitResult.success) {
    throw new Error(
      `Rate limit exceeded. Retry after ${rateLimitResult.reset} seconds`
    );
  }

  const client = await getSlackClient(userId);

  if (!client) {
    throw new Error("Slack integration not found");
  }

  return await withRetry(async () => {
    const result = await client.chat.postMessage({
      channel: channelId,
      text: options.text,
      ...(options.blocks && { blocks: options.blocks }),
      ...(options.thread_ts && { thread_ts: options.thread_ts }),
    });

    if (!result.ok) {
      throw new Error(`Failed to post to Slack: ${result.error}`);
    }

    return {
      ts: result.ts,
      channel: result.channel,
    };
  });
}

/**
 * Get list of channels in Slack workspace
 * Includes rate limiting, retry logic, and pagination for large workspaces
 */
export async function getSlackChannels(
  userId: string,
  options?: { maxChannels?: number }
) {
  // Rate limit check
  const rateLimitResult = await slackRateLimiter.limit(`user:${userId}`);

  if (!rateLimitResult.success) {
    throw new Error(
      `Rate limit exceeded. Retry after ${rateLimitResult.reset} seconds`
    );
  }

  const client = await getSlackClient(userId);

  if (!client) {
    throw new Error("Slack integration not found");
  }

  const maxChannels = options?.maxChannels || 500; // Default limit to prevent huge responses
  const allChannels: Array<{
    id: string;
    name: string;
    isPrivate: boolean;
    isMember: boolean;
  }> = [];

  let cursor: string | undefined;

  return await withRetry(async () => {
    // Paginate through all channels
    do {
      const result = await client.conversations.list({
        types: "public_channel,private_channel",
        exclude_archived: true,
        limit: 200, // Max per request
        cursor,
      });

      if (!result.ok) {
        throw new Error(`Failed to fetch channels: ${result.error}`);
      }

      const channels = (result.channels || []).map((channel) => ({
        id: channel.id!,
        name: channel.name!,
        isPrivate: channel.is_private || false,
        isMember: channel.is_member || false,
      }));

      allChannels.push(...channels);

      // Get next cursor for pagination
      cursor = result.response_metadata?.next_cursor;

      // Stop if we've reached the max
      if (allChannels.length >= maxChannels) {
        console.log(
          `[Slack] Reached max channels limit (${maxChannels}), stopping pagination`
        );
        break;
      }
    } while (cursor);

    return allChannels;
  });
}

/**
 * Get Slack workspace info
 * Includes retry logic
 */
export async function getSlackWorkspaceInfo(accessToken: string) {
  const client = new WebClient(accessToken);

  return await withRetry(async () => {
    const teamInfo = await client.team.info();
    const authTest = await client.auth.test();

    if (!teamInfo.ok || !authTest.ok) {
      throw new Error(
        `Failed to fetch workspace info: ${teamInfo.error || authTest.error}`
      );
    }

    return {
      teamId: authTest.team_id!,
      teamName: teamInfo.team!.name!,
      teamIcon: teamInfo.team!.icon?.image_68,
      botUserId: authTest.user_id,
    };
  });
}
