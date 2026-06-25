import { createServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { parse } from "url";
import { loadEnvConfig } from "@next/env";
import { Buffer } from "node:buffer";

const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as Sentry from "@sentry/node";
import { scrubSentryEvent } from "@/features/privacy/public-server";
import { parseJsonValue } from "@/shared/http/json";

import { env } from "@/shared/config/server-env";
// Initialize Sentry for the standalone Node.js Project
Sentry.init({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: env.NODE_ENV,
  serverName: "websocket-server",
  sendDefaultPii: false,
  enableLogs: true,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
});
import {
  authenticateWebSocket,
  verifyPublicAccess,
  sendAuthError,
} from "./middleware/auth";
import {
  checkConnectionAllowed,
  releaseConnection,
  getClientIdentifier,
} from "./middleware/rate-limit";
import { SurveyResponseVoiceHandler } from "@/features/surveys/realtime/survey-response-voice";
import { SampleSurveyVoiceHandler } from "@/features/surveys/realtime/sample-survey-voice";
import { getRedisSubscriber } from "@/shared/infra/redis";
import { getSurveyPermissionContext } from "@/features/surveys/public-server";
import { resolveTeacherOwnedClassroomAccess } from "@/features/tutoring/public-server";

/**
 * WebSocket Server for Voice-Enabled Surveys
 * Handles real-time voice interactions for survey creation and responses
 */

const PORT = Number.parseInt(env.WEBSOCKET_PORT, 10);

type ManagedVoiceHandler = {
  initialize: () => Promise<void>;
  getSocket: () => WebSocket | null;
};

type ActiveConnection = {
  handler: ManagedVoiceHandler;
  userId?: string;
  createdAt: number;
};

type RealtimeConnection = {
  ws: WebSocket;
  userId: string;
  subscriptions: Set<string>;
};

type RealtimeClientMessage =
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string };

// Track active connections
const activeConnections = new Map<string, ActiveConnection>();
const realtimeConnections = new Map<string, RealtimeConnection>();
const realtimeChannelSubscriptions = new Map<string, Set<string>>();

// Redis pub/sub subscriber for realtime events
let redisSubscriber: ReturnType<typeof getRedisSubscriber> | null = null;
let redisSubscriberReconnectAttempts = 0;
const MAX_REDIS_RECONNECT_ATTEMPTS = 10;
const REDIS_RECONNECT_DELAY_MS = 5000;

// Cleanup interval for stale connections
const CLEANUP_INTERVAL_MS = 60000; // Every minute
const MAX_CONNECTION_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours max connection age

function getSingleQueryParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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

function closeVoiceHandlerConnection(handler: ManagedVoiceHandler): void {
  const socket = handler.getSocket();
  if (!socket) {
    return;
  }

  if (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  ) {
    socket.close();
  }
}

/**
 * Cleanup stale connections that may have leaked
 * This catches connections where the close event was missed
 */
function cleanupStaleConnections(): void {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [connectionId, connection] of activeConnections) {
    try {
      const ws = connection.handler.getSocket();
      const isClosed = ws && ws.readyState === WebSocket.CLOSED;
      const isTooOld = now - connection.createdAt > MAX_CONNECTION_AGE_MS;

      if (isClosed || isTooOld) {
        closeVoiceHandlerConnection(connection.handler);
        activeConnections.delete(connectionId);
        cleanedCount++;
      }
    } catch (error) {
      Sentry.logger.error("WebSocket stale connection cleanup failed", {
        service: "websocket-server",
        connection_id: connectionId,
        error_message: error instanceof Error ? error.message : String(error),
      });
      // If we can't check the connection, remove it to be safe
      activeConnections.delete(connectionId);
      cleanedCount++;
    }
  }

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

  if (cleanedCount > 0) {
  }
}

// Start periodic cleanup
const cleanupInterval = setInterval(
  cleanupStaleConnections,
  CLEANUP_INTERVAL_MS,
);

/**
 * Create HTTP server
 */
const server = createServer((req, res) => {
  // Health check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        activeConnections: activeConnections.size,
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

/**
 * Create WebSocket server
 */
const wss = new WebSocketServer({
  server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 10,
    threshold: 1024,
  },
});

/**
 * Handle new WebSocket connections
 */
wss.on("connection", (ws: WebSocket, req) => {
  void (async () => {
  const url = parse(req.url || "", true);
  const pathname = url.pathname || "";


  try {
    // Route based on pathname
    if (pathname === "/voice/survey-response") {
      await handleSurveyResponse(ws, req);
    } else if (pathname === "/voice/sample-conversation") {
      await handleSampleConversation(ws, req);
    } else if (pathname === "/realtime") {
      await handleRealtime(ws, req);
    } else {
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Invalid endpoint",
        }),
      );
      ws.close();
    }
  } catch (error) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
    ws.close();
  }
  })();
});

/**
 * Handle survey response voice connections (public)
 */
async function handleSurveyResponse(
  ws: WebSocket,
  req: IncomingMessage,
): Promise<void> {
  const accessResult = await verifyPublicAccess(req);

  if ("code" in accessResult) {
    sendAuthError(ws, accessResult);
    return;
  }

  const { surveyId, conversationId } = accessResult;

  // Get client identifier (IP-based for public access)
  const identifier = getClientIdentifier(req);

  // Check rate limits with Upstash
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

  try {
    // Extract language from URL
    const url = parse(req.url || "", true);
    const language = getSingleQueryParam(url.query?.language) || "en";

    // Create handler with language
    const handler = new SurveyResponseVoiceHandler(
      ws,
      surveyId,
      conversationId,
      identifier,
      language,
    );
    await handler.initialize();

    // Track connection with timestamp for cleanup
    const connectionId = `response-${surveyId}-${Date.now()}`;
    activeConnections.set(connectionId, { handler, createdAt: Date.now() });

    // Handle disconnection
    ws.on("close", () => {
      activeConnections.delete(connectionId);
      void releaseConnection(identifier);
    });

  } catch (error) {
    await releaseConnection(identifier);
    ws.send(
      JSON.stringify({
        type: "error",
        error: `Failed to initialize voice session: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
    ws.close();
  }
}

/**
 * Handle sample survey voice connections (authenticated owner)
 */
async function handleSampleConversation(
  ws: WebSocket,
  req: IncomingMessage,
): Promise<void> {
  // Authenticate as owner
  const authResult = await authenticateWebSocket(ws, req);

  if ("code" in authResult) {
    sendAuthError(ws, authResult);
    return;
  }

  const connection = authResult;

  // Get surveyId and conversationNumber from query parameters
  const url = parse(req.url || "", true);
  const surveyId = getSingleQueryParam(url.query?.surveyId);
  const conversationNumber = parseInt(
    getSingleQueryParam(url.query?.conversationNumber) || "1",
  );

  if (!surveyId) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Survey ID required",
      }),
    );
    ws.close();
    return;
  }

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

  try {
    const handler = new SampleSurveyVoiceHandler(
      connection,
      surveyId,
      conversationNumber,
    );
    await handler.initialize();

    const connectionId = `sample-${connection.userId}-${surveyId}-${Date.now()}`;
    activeConnections.set(connectionId, {
      handler,
      userId: connection.userId,
      createdAt: Date.now(),
    });

    ws.on("close", () => {
      activeConnections.delete(connectionId);
      void releaseConnection(identifier);
    });

  } catch (error) {
    await releaseConnection(identifier);
    ws.send(
      JSON.stringify({
        type: "error",
        error: `Failed to initialize sample voice session: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
    ws.close();
  }
}

async function handleRealtime(
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

/**
 * Initialize Redis pub/sub subscriber
 */
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
        const delay = REDIS_RECONNECT_DELAY_MS * Math.pow(2, redisSubscriberReconnectAttempts);
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

/**
 * Handle server errors
 */
wss.on("error", (error) => {
  Sentry.logger.error("WebSocket server error", {
    service: "websocket-server",
    error_message: error instanceof Error ? error.message : String(error),
  });
});

/**
 * Start server
 */
server.listen(PORT, () => {
  // Initialize Redis pub/sub subscriber
  initializeRedisSubscriber();


  if (env.SENTRY_TEST_TRIGGER) {
    throw new Error("Sentry Test WebSocket Error: This is a test error from the WebSocket process.");
  }
});

/**
 * Graceful shutdown
 */
async function shutdownServer(): Promise<void> {

  // Stop the cleanup interval
  clearInterval(cleanupInterval);

  // Prevent Redis reconnection attempts during shutdown
  redisSubscriberReconnectAttempts = MAX_REDIS_RECONNECT_ATTEMPTS;

  // Unsubscribe from Redis channels
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

  // Close all active connections
  for (const [connectionId, { handler }] of activeConnections.entries()) {
    try {
      closeVoiceHandlerConnection(handler);
    } catch (error) {
      Sentry.logger.error("WebSocket handler shutdown failed", {
        service: "websocket-server",
        connection_id: connectionId,
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const connection of realtimeConnections.values()) {
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.close();
    }
  }

  // Close WebSocket server
  wss.close(() => {
  });

  // Close HTTP server
  server.close(() => {
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => {
  void shutdownServer();
});

process.on("SIGINT", () => {
  void shutdownServer();
});
