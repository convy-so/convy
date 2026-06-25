import { getRedisClient } from "@/shared/infra/redis";

type RealtimeScope = "classroom" | "survey";

type RealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

export async function publishRealtimeEvent(
  scope: RealtimeScope,
  entityId: string,
  payload: RealtimeEvent,
): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.publish(
      `pubsub:realtime:${scope}:${entityId}`,
      JSON.stringify(payload),
    );
  } catch (error) {
    console.error("[realtime] failed to publish event", {
      scope,
      entityId,
      eventType: payload.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function publishClassroomRealtimeEvent(
  classroomId: string,
  payload: RealtimeEvent,
): Promise<void> {
  await publishRealtimeEvent("classroom", classroomId, {
    classroomId,
    occurredAt: new Date().toISOString(),
    ...payload,
  });
}
