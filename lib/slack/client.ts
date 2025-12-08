/**
 * Slack Client Manager
 *
 * Manages Slack Web API clients with OAuth tokens
 */

import { WebClient } from "@slack/web-api";
import { getSlackClient } from "./oauth";

/**
 * Post a message to a Slack channel
 */
export async function postToSlackChannel(
  userId: string,
  channelId: string,
  options: {
    text: string;
    blocks?: unknown[];
    thread_ts?: string;
  }
) {
  const client = await getSlackClient(userId);

  if (!client) {
    throw new Error("Slack integration not found");
  }

  const result = await client.chat.postMessage({
    channel: channelId,
    text: options.text,
    blocks: options.blocks,
    thread_ts: options.thread_ts,
  });

  if (!result.ok) {
    throw new Error(`Failed to post to Slack: ${result.error}`);
  }

  return {
    ts: result.ts,
    channel: result.channel,
  };
}

/**
 * Get list of channels in Slack workspace
 */
export async function getSlackChannels(userId: string) {
  const client = await getSlackClient(userId);

  if (!client) {
    throw new Error("Slack integration not found");
  }

  const result = await client.conversations.list({
    types: "public_channel,private_channel",
    exclude_archived: true,
    limit: 200,
  });

  if (!result.ok) {
    throw new Error(`Failed to fetch channels: ${result.error}`);
  }

  return (result.channels || []).map((channel) => ({
    id: channel.id!,
    name: channel.name!,
    isPrivate: channel.is_private || false,
    isMember: channel.is_member || false,
  }));
}

/**
 * Get Slack workspace info
 */
export async function getSlackWorkspaceInfo(accessToken: string) {
  const client = new WebClient(accessToken);

  const teamInfo = await client.team.info();
  const authTest = await client.auth.test();

  if (!teamInfo.ok || !authTest.ok) {
    throw new Error("Failed to fetch workspace info");
  }

  return {
    teamId: authTest.team_id!,
    teamName: teamInfo.team!.name!,
    teamIcon: teamInfo.team!.icon?.image_68,
    botUserId: authTest.user_id,
  };
}
