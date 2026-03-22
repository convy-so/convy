import { getRedisClient } from "./redis";

export type WorkspaceEventType = 
  | "SURVEY_CREATED" 
  | "PROJECT_CREATED" 
  | "SURVEY_UPDATED" 
  | "PROJECT_UPDATED" 
  | "SURVEY_DELETED" 
  | "PROJECT_DELETED"
  | "WORKSPACE_UPDATED";

export interface WorkspaceEvent {
  type: WorkspaceEventType;
  workspaceId: string;
  userId: string;
  userName?: string;
  data: any;
  timestamp: string;
}

/**
 * Publishes an event to a workspace's Redis stream and pub/sub channel.
 * This patterns ensures zero data loss (Streams) and low-latency notifications (Pub/Sub).
 */
export async function publishWorkspaceEvent(event: WorkspaceEvent) {
  const redis = getRedisClient();
  const streamKey = `stream:workspace:${event.workspaceId}`;
  const pubsubChannel = `pubsub:workspace:${event.workspaceId}`;

  const payload = JSON.stringify(event);

  // 1. Append to Stream (Persistent)
  const streamId = await redis.xadd(streamKey, "*", "event", payload);

  // 2. Publish to Pub/Sub (Transient Notification)
  await redis.publish(pubsubChannel, JSON.stringify({
    ...event,
    streamId
  }));

  console.log(`[Redis Events] Published ${event.type} to workspace ${event.workspaceId} (Stream ID: ${streamId})`);
  
  return streamId;
}
