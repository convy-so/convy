import type { IncomingMessage } from "http";
import { WebSocket } from "ws";
import * as Sentry from "@sentry/node";

import {
  authenticateWebSocket,
  sendAuthError,
} from "@/shared/realtime/middleware/auth";
import {
  checkConnectionAllowed,
  getClientIdentifier,
  releaseConnection,
} from "@/shared/realtime/middleware/rate-limit";
import { getSurveyPermissionContext } from "@/features/surveys/public-server";
import { resolveTeacherOwnedClassroomAccess } from "@/features/tutoring/public-server";
import { getRedisSubscriber } from "@/shared/infra/redis";
import { parseJsonValue } from "@/shared/http/json";

type RealtimeConnection = {
  ws: WebSocket;
  userId: string;
  subscriptions: Set<string>;
};

type RealtimeClientMessage =
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string };

const MAX_REDIS_RECONNECT_ATTEMPTS = 10;
const REDIS_RECONNECT_DELAY_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRealtimeClientMessage(value: unknown): RealtimeClientMessage | null {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.channel !== "string") {
    return null;
  }

  if (value.type === "subscribe" || value.type === "unsubscribe") {
    return { type: value.type, channel: value.channel };
  }

  return null;
}

function parseRealtimeRedisChannel(channel: string): { subscriptionKey: string } | null {
  if (!channel.startsWith("pubsub:realtime:")) {
    return null;
  }

  const parts = channel.split(":");
  const scope = parts[2];
  const entityId = parts[3];
  if (!scope || !entityId) {
    return null;
  }

  return { subscriptionKey: `${scope}:${entityId}` };
}

function normalizeWebSocketRawData(raw: unknown): string | null {
  if (typeof raw === "string") {
    return raw;
  }

  if (raw instanceof Buffer) {
    return raw.toString("utf8");
  }

  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString("utf8");
  }

  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString("utf8");
  }

  return null;
}

export function createRealtimeRuntime() {
  const realtimeConnections = new Map<string, RealtimeConnection>();
  const realtimeChannelSubscriptions = new Map<string, Set<string>>();
  let redisSubscriber: ReturnType<typeof getRedisSubscriber> | null = null;
  let redisSubscriberReconnectAttempts = 0;

  function removeRealtimeConnectionSubscriptions(connectionId: string): void {
    const active = realtimeConnections.get(connectionId);
    if (!active) {
      return;
    }

    for (const channel of active.subscriptions) {
      realtimeChannelSubscriptions.get(channel)?.delete(connectionId);
      if (realtimeChannelSubscriptions.get(channel)?.size === 0) {
        realtimeChannelSubscriptions.delete(channel);
      }
    }
  }

  async function authorizeRealtimeSubscription(
    userId: string,
    channel: string,
  ): Promise<boolean> {
    if (channel.startsWith("survey:")) {
      const surveyId = channel.slice("survey:".length);
      const permission = await getSurveyPermissionContext(userId, surveyId);
      return Boolean(permission?.canView);
    }

    if (channel.startsWith("classroom:")) {
      const classroomId = channel.slice("classroom:".length);
      const access = await resolveTeacherOwnedClassroomAccess({
        teacherUserId: userId,
        classroomId,
      });
      return !("error" in access);
    }

    return false;
  }

  async function handleRealtimeClientMessage(input: {
    ws: WebSocket;
    userId: string;
    connectionId: string;
    raw: unknown;
  }): Promise<void> {
    try {
      const rawText = normalizeWebSocketRawData(input.raw);
      if (!rawText) {
        throw new Error("Invalid realtime message payload");
      }

      const data = parseRealtimeClientMessage(parseJsonValue(rawText));
      if (!data) {
        throw new Error("Invalid realtime message payload");
      }

      if (data.type === "subscribe") {
        const allowed = await authorizeRealtimeSubscription(
          input.userId,
          data.channel,
        );

        if (!allowed) {
          input.ws.send(
            JSON.stringify({
              type: "subscription_error",
              channel: data.channel,
              error: "Unauthorized",
            }),
          );
          return;
        }

        realtimeConnections.get(input.connectionId)?.subscriptions.add(data.channel);
        if (!realtimeChannelSubscriptions.has(data.channel)) {
          realtimeChannelSubscriptions.set(data.channel, new Set<string>());
        }
        realtimeChannelSubscriptions.get(data.channel)?.add(input.connectionId);
        input.ws.send(JSON.stringify({ type: "subscribed", channel: data.channel }));
        return;
      }

      realtimeConnections.get(input.connectionId)?.subscriptions.delete(data.channel);
      realtimeChannelSubscriptions.get(data.channel)?.delete(input.connectionId);
      if (realtimeChannelSubscriptions.get(data.channel)?.size === 0) {
        realtimeChannelSubscriptions.delete(data.channel);
      }
      input.ws.send(JSON.stringify({ type: "unsubscribed", channel: data.channel }));
    } catch (error) {
      input.ws.send(
        JSON.stringify({
          type: "error",
          error:
            error instanceof Error ? error.message : "Invalid realtime message",
        }),
      );
    }
  }

  function initializeRedisSubscriber(): void {
    try {
      if (redisSubscriber) {
        void redisSubscriber.quit().catch(() => {});
        redisSubscriber = null;
      }

      redisSubscriber = getRedisSubscriber();
      void redisSubscriber.psubscribe("pubsub:realtime:*");

      redisSubscriber.on("pmessage", (_pattern, channel, message) => {
        void (() => {
          try {
            const parsedChannel = parseRealtimeRedisChannel(channel);
            if (!parsedChannel) {
              return;
            }

            const data = parseJsonValue(message);
            for (const connectionId of realtimeChannelSubscriptions.get(parsedChannel.subscriptionKey) ?? []) {
              const connection = realtimeConnections.get(connectionId);
              if (connection?.ws.readyState === WebSocket.OPEN) {
                connection.ws.send(JSON.stringify(data));
              }
            }
          } catch (error) {
            Sentry.logger.error("WebSocket Redis message handling failed", {
              service: "websocket-server",
              error_message: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      });

      redisSubscriber.on("error", (error) => {
        Sentry.logger.error("WebSocket Redis subscriber error", {
          service: "websocket-server",
          error_message: error instanceof Error ? error.message : String(error),
          reconnect_attempt: redisSubscriberReconnectAttempts + 1,
        });
        if (redisSubscriberReconnectAttempts < MAX_REDIS_RECONNECT_ATTEMPTS) {
          const delay =
            REDIS_RECONNECT_DELAY_MS * Math.pow(2, redisSubscriberReconnectAttempts);
          redisSubscriberReconnectAttempts++;
          setTimeout(initializeRedisSubscriber, delay);
        }
      });

      redisSubscriber.on("connect", () => {
        redisSubscriberReconnectAttempts = 0;
      });

      redisSubscriber.on("end", () => {
        if (redisSubscriberReconnectAttempts < MAX_REDIS_RECONNECT_ATTEMPTS) {
          redisSubscriberReconnectAttempts++;
          setTimeout(initializeRedisSubscriber, REDIS_RECONNECT_DELAY_MS);
        }
      });
    } catch (error) {
      Sentry.logger.error("WebSocket Redis subscriber initialization failed", {
        service: "websocket-server",
        error_message: error instanceof Error ? error.message : String(error),
      });
      if (redisSubscriberReconnectAttempts < MAX_REDIS_RECONNECT_ATTEMPTS) {
        redisSubscriberReconnectAttempts++;
        setTimeout(initializeRedisSubscriber, REDIS_RECONNECT_DELAY_MS);
      }
    }
  }

  async function handleConnection(
    ws: WebSocket,
    req: IncomingMessage,
  ): Promise<void> {
    const authResult = await authenticateWebSocket(ws, req);
    if ("code" in authResult) {
      sendAuthError(ws, authResult);
      return;
    }

    const connection = authResult;
    const identifier = getClientIdentifier(req, connection.userId);
    const rateLimitCheck = await checkConnectionAllowed(identifier);

    if (!rateLimitCheck.allowed) {
      ws.send(
        JSON.stringify({
          type: "error",
          error: rateLimitCheck.reason,
          retryAfter: rateLimitCheck.retryAfter,
        }),
      );
      ws.close();
      return;
    }

    const connectionId = `realtime-${connection.userId}-${Date.now()}`;
    realtimeConnections.set(connectionId, {
      ws,
      userId: connection.userId,
      subscriptions: new Set<string>(),
    });

    ws.on("message", (raw) => {
      void handleRealtimeClientMessage({
        ws,
        userId: connection.userId,
        connectionId,
        raw,
      });
    });

    ws.on("close", () => {
      removeRealtimeConnectionSubscriptions(connectionId);
      realtimeConnections.delete(connectionId);
      void releaseConnection(identifier);
    });

    ws.send(JSON.stringify({ type: "connected" }));
  }

  function cleanupClosedConnections(): number {
    let cleanedCount = 0;

    for (const [connectionId, connection] of realtimeConnections) {
      if (
        connection.ws.readyState === WebSocket.CLOSED ||
        connection.ws.readyState === WebSocket.CLOSING
      ) {
        removeRealtimeConnectionSubscriptions(connectionId);
        realtimeConnections.delete(connectionId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  async function shutdown(): Promise<void> {
    redisSubscriberReconnectAttempts = MAX_REDIS_RECONNECT_ATTEMPTS;

    if (redisSubscriber) {
      try {
        await redisSubscriber.punsubscribe("pubsub:realtime:*");
        await redisSubscriber.quit();
      } catch (error) {
        Sentry.logger.error("WebSocket Redis subscriber shutdown failed", {
          service: "websocket-server",
          error_message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const connection of realtimeConnections.values()) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close();
      }
    }

    realtimeConnections.clear();
    realtimeChannelSubscriptions.clear();
  }

  return {
    cleanupClosedConnections,
    getConnectionCount: () => realtimeConnections.size,
    handleConnection,
    initializeRedisSubscriber,
    shutdown,
  };
}
