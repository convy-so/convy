#!/usr/bin/env node

import { createServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { parse } from "url";
import { loadEnvConfig } from "@next/env";

const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { env } from "@/lib/env";
import {
  authenticateWebSocket,
  verifyPublicAccess,
  sendAuthError,
  getClientIP,
  type AuthenticatedConnection,
} from "./middleware/auth";
import {
  checkConnectionAllowed,
  releaseConnection,
  getClientIdentifier,
} from "./middleware/rate-limit";
import { SurveyCreationVoiceHandler } from "./handlers/survey-creation-voice";
import { SurveyResponseVoiceHandler } from "./handlers/survey-response-voice";
import { SampleSurveyVoiceHandler } from "./handlers/sample-survey-voice";
import { AnalyticsHandler } from "./handlers/analytics";
import { getRedisSubscriber } from "@/lib/redis";

/**
 * WebSocket Server for Voice-Enabled Surveys
 * Handles real-time voice interactions for survey creation and responses
 */

const PORT = parseInt(env.WEBSOCKET_PORT);

// Track active connections
const activeConnections = new Map<
  string,
  {
    handler:
      | SurveyCreationVoiceHandler
      | SurveyResponseVoiceHandler
      | SampleSurveyVoiceHandler
      | AnalyticsHandler;
    userId?: string;
    createdAt: number; // Track when connection was created for cleanup
  }
>();

// Issue 14 Fix: Flattened Map (userId + ":" + surveyId) -> handler to prevent nested Map leaks
const analyticsConnections = new Map<string, AnalyticsHandler>();

// Redis pub/sub subscriber for analytics events
let redisSubscriber: ReturnType<typeof getRedisSubscriber> | null = null;
let redisSubscriberReconnectAttempts = 0;
const MAX_REDIS_RECONNECT_ATTEMPTS = 10;
const REDIS_RECONNECT_DELAY_MS = 5000;

// Cleanup interval for stale connections
const CLEANUP_INTERVAL_MS = 60000; // Every minute
const MAX_CONNECTION_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours max connection age

/**
 * Cleanup stale connections that may have leaked
 * This catches connections where the close event was missed
 */
function cleanupStaleConnections(): void {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [connectionId, connection] of activeConnections) {
    try {
      // Check if WebSocket is closed by accessing private ws property
      // Cast to unknown first to bypass private property TypeScript check
      const ws =
        connection.handler && "ws" in connection.handler
          ? (connection.handler as unknown as { ws: WebSocket }).ws
          : null;

      const isClosed = ws && ws.readyState === WebSocket.CLOSED;
      const isTooOld = now - connection.createdAt > MAX_CONNECTION_AGE_MS;

      if (isClosed || isTooOld) {
        activeConnections.delete(connectionId);
        cleanedCount++;

        // Also clean up from analyticsConnections if applicable
        if (connection.userId && connection.handler instanceof AnalyticsHandler) {
          const key = `${connection.userId}:${connection.handler.surveyId}`;
          if (analyticsConnections.get(key) === connection.handler) {
            analyticsConnections.delete(key);
          }
        }
      }
    } catch {
      // If we can't check the connection, remove it to be safe
      activeConnections.delete(connectionId);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(
      `[WebSocket] Cleaned up ${cleanedCount} stale connections. Active: ${activeConnections.size}`
    );
  }
}

// Start periodic cleanup
const cleanupInterval = setInterval(
  cleanupStaleConnections,
  CLEANUP_INTERVAL_MS
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
      })
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
wss.on("connection", async (ws: WebSocket, req) => {
  const clientIP = getClientIP(req);
  const url = parse(req.url || "", true);
  const pathname = url.pathname || "";

  console.log(`[WebSocket] New connection from ${clientIP} to ${pathname}`);

  try {
    // Route based on pathname
    if (pathname === "/voice/survey-creation") {
      await handleSurveyCreation(ws, req);
    } else if (pathname === "/voice/survey-response") {
      await handleSurveyResponse(ws, req);
    } else if (pathname === "/voice/sample-conversation") {
      await handleSampleConversation(ws, req);
    } else if (pathname === "/analytics") {
      await handleAnalytics(ws, req);
    } else {
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Invalid endpoint",
        })
      );
      ws.close();
    }
  } catch (error) {
    console.error("[WebSocket] Connection error:", error);
    ws.send(
      JSON.stringify({
        type: "error",
        error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
      })
    );
    ws.close();
  }
});

/**
 * Handle survey creation voice connections (authenticated)
 */
async function handleSurveyCreation(
  ws: WebSocket,
  req: IncomingMessage
): Promise<void> {
  const authResult = await authenticateWebSocket(ws, req);

  if ("code" in authResult) {
    sendAuthError(ws, authResult);
    return;
  }

  const connection = authResult as AuthenticatedConnection;

  // Get client identifier (user-based)
  const identifier = getClientIdentifier(req, connection.userId);

  // Check rate limits with Upstash
  const rateLimitCheck = await checkConnectionAllowed(identifier);

  if (!rateLimitCheck.allowed) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: rateLimitCheck.reason,
        retryAfter: rateLimitCheck.retryAfter,
      })
    );
    ws.close();
    return;
  }

  try {
    // Create handler
    const handler = new SurveyCreationVoiceHandler(connection);
    await handler.initialize();

    // Track connection with timestamp for cleanup
    const connectionId = `creation-${connection.userId}-${Date.now()}`;
    activeConnections.set(connectionId, {
      handler,
      userId: connection.userId,
      createdAt: Date.now(),
    });

    // Handle disconnection
    ws.on("close", async () => {
      activeConnections.delete(connectionId);
      await releaseConnection(identifier);
      console.log(
        `[WebSocket] Survey creation connection closed for user ${connection.userId}`
      );
    });

    console.log(
      `[WebSocket] Survey creation handler initialized for user ${connection.userId}`
    );
  } catch (error) {
    console.error("[WebSocket] Survey creation handler error:", error);
    await releaseConnection(identifier);
    ws.send(
      JSON.stringify({
        type: "error",
        error: `Failed to initialize voice session: ${error instanceof Error ? error.message : String(error)}`,
      })
    );
    ws.close();
  }
}

/**
 * Handle survey response voice connections (public)
 */
async function handleSurveyResponse(
  ws: WebSocket,
  req: IncomingMessage
): Promise<void> {
  const accessResult = await verifyPublicAccess(req);

  if ("code" in accessResult) {
    sendAuthError(ws, accessResult);
    return;
  }

  const { surveyId } = accessResult;

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
      })
    );
    ws.close();
    return;
  }

  try {
    // Create handler
    const handler = new SurveyResponseVoiceHandler(ws, surveyId, identifier);
    await handler.initialize();

    // Track connection with timestamp for cleanup
    const connectionId = `response-${surveyId}-${Date.now()}`;
    activeConnections.set(connectionId, { handler, createdAt: Date.now() });

    // Handle disconnection
    ws.on("close", async () => {
      activeConnections.delete(connectionId);
      await releaseConnection(identifier);
      console.log(
        `[WebSocket] Survey response connection closed for survey ${surveyId}`
      );
    });

    console.log(
      `[WebSocket] Survey response handler initialized for survey ${surveyId}`
    );
  } catch (error) {
    console.error("[WebSocket] Survey response handler error:", error);
    await releaseConnection(identifier);
    ws.send(
      JSON.stringify({
        type: "error",
        error: `Failed to initialize voice session: ${error instanceof Error ? error.message : String(error)}`,
      })
    );
    ws.close();
  }
}

/**
 * Handle sample survey voice connections (authenticated owner)
 */
async function handleSampleConversation(
  ws: WebSocket,
  req: IncomingMessage
): Promise<void> {
  // Authenticate as owner
  const authResult = await authenticateWebSocket(ws, req);

  if ("code" in authResult) {
    sendAuthError(ws, authResult);
    return;
  }

  const connection = authResult as AuthenticatedConnection;

  // Get surveyId and conversationNumber from query parameters
  const url = parse(req.url || "", true);
  const surveyId = url.query?.surveyId as string;
  const conversationNumber = parseInt(
    (url.query?.conversationNumber as string) || "1"
  );

  if (!surveyId) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Survey ID required",
      })
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
      })
    );
    ws.close();
    return;
  }

  try {
    const handler = new SampleSurveyVoiceHandler(
      connection,
      surveyId,
      conversationNumber
    );
    await handler.initialize();

    const connectionId = `sample-${connection.userId}-${surveyId}-${Date.now()}`;
    activeConnections.set(connectionId, {
      handler,
      userId: connection.userId,
      createdAt: Date.now(),
    });

    ws.on("close", async () => {
      activeConnections.delete(connectionId);
      await releaseConnection(identifier);
    });

    console.log(
      `[WebSocket] Sample voice handler initialized for user ${connection.userId}, survey ${surveyId}`
    );
  } catch (error) {
    console.error("[WebSocket] Sample voice handler error:", error);
    await releaseConnection(identifier);
    ws.send(
      JSON.stringify({
        type: "error",
        error: `Failed to initialize sample voice session: ${error instanceof Error ? error.message : String(error)}`,
      })
    );
    ws.close();
  }
}

/**
 * Handle analytics connections (authenticated)
 */
async function handleAnalytics(
  ws: WebSocket,
  req: IncomingMessage
): Promise<void> {
  // Authenticate connection
  const authResult = await authenticateWebSocket(ws, req);

  if ("code" in authResult) {
    sendAuthError(ws, authResult);
    return;
  }

  const connection = authResult as AuthenticatedConnection;

  // Get surveyId from query parameters
  const url = parse(req.url || "", true);
  const surveyId = url.query?.surveyId as string;

  if (!surveyId) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Survey ID is required",
      })
    );
    ws.close(1008, "Survey ID required");
    return;
  }

  // Get client identifier (user-based)
  const identifier = getClientIdentifier(req, connection.userId);

  // Check rate limits
  const rateLimitCheck = await checkConnectionAllowed(identifier);

  if (!rateLimitCheck.allowed) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: rateLimitCheck.reason,
        retryAfter: rateLimitCheck.retryAfter,
      })
    );
    ws.close();
    return;
  }

  try {
    // Create handler
    const handler = new AnalyticsHandler(connection, surveyId);
    await handler.initialize();

    // Track connection with timestamp for cleanup
    const connectionId = `analytics-${connection.userId}-${surveyId}-${Date.now()}`;
    activeConnections.set(connectionId, {
      handler,
      userId: connection.userId,
      createdAt: Date.now(),
    });

    // Track analytics connection for Redis pub/sub routing
    const analyticsKey = `${connection.userId}:${surveyId}`;
    analyticsConnections.set(analyticsKey, handler);

    // Handle disconnection
    ws.on("close", async () => {
      activeConnections.delete(connectionId);
      analyticsConnections.delete(analyticsKey);
      await releaseConnection(identifier);
      console.log(
        `[WebSocket] Analytics connection closed for user ${connection.userId}, survey ${surveyId}`
      );
    });

    console.log(
      `[WebSocket] Analytics handler initialized for user ${connection.userId}, survey ${surveyId}`
    );
  } catch (error) {
    console.error("[WebSocket] Analytics handler error:", error);
    await releaseConnection(identifier);
    ws.send(
      JSON.stringify({
        type: "error",
        error: `Failed to initialize analytics connection: ${error instanceof Error ? error.message : String(error)}`,
      })
    );
    ws.close();
  }
}

/**
 * Initialize Redis pub/sub subscriber for analytics events
 * Includes automatic reconnection on failure
 */
function initializeRedisSubscriber(): void {
  try {
    // Clean up existing subscriber if any
    if (redisSubscriber) {
      try {
        redisSubscriber.quit().catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
      redisSubscriber = null;
    }

    redisSubscriber = getRedisSubscriber();

    // Subscribe to all analytics completion channels using pattern matching
    // Pattern: analytics:complete:*:*
    redisSubscriber.psubscribe("analytics:complete:*:*");

    redisSubscriber.on("pmessage", async (pattern, channel, message) => {
      try {
        // Parse channel: analytics:complete:{surveyId}:{userId}
        const parts = channel.split(":");
        if (
          parts.length === 4 &&
          parts[0] === "analytics" &&
          parts[1] === "complete"
        ) {
          const surveyId = parts[2];
          const userId = parts[3];

          // Parse message
          const data = JSON.parse(message);

          // Find and notify connected clients
          const analyticsKey = `${userId}:${surveyId}`;
          const handler = analyticsConnections.get(analyticsKey);
          if (handler) {
            handler.handleAnalyticsUpdate(data);
            console.log(
              `[Redis Pub/Sub] Delivered analytics update to user ${userId}, survey ${surveyId}`
            );
          }
        }
      } catch (error) {
        console.error("[Redis Pub/Sub] Error processing message:", error);
      }
    });

    redisSubscriber.on("error", (error) => {
      console.error("[Redis Pub/Sub] Subscriber error:", error);

      // Attempt reconnection with exponential backoff
      if (redisSubscriberReconnectAttempts < MAX_REDIS_RECONNECT_ATTEMPTS) {
        const delay =
          REDIS_RECONNECT_DELAY_MS *
          Math.pow(2, redisSubscriberReconnectAttempts);
        redisSubscriberReconnectAttempts++;

        console.log(
          `[Redis Pub/Sub] Attempting reconnection in ${delay}ms (attempt ${redisSubscriberReconnectAttempts}/${MAX_REDIS_RECONNECT_ATTEMPTS})`
        );

        setTimeout(() => {
          initializeRedisSubscriber();
        }, delay);
      } else {
        console.error(
          "[Redis Pub/Sub] Max reconnection attempts reached. Analytics updates will not be delivered in real-time."
        );
      }
    });

    redisSubscriber.on("connect", () => {
      // Reset reconnect counter on successful connection
      redisSubscriberReconnectAttempts = 0;
      console.log("[Redis Pub/Sub] Subscriber connected");
    });

    redisSubscriber.on("end", () => {
      console.log("[Redis Pub/Sub] Subscriber connection ended");

      // Attempt reconnection if not shutting down
      if (redisSubscriberReconnectAttempts < MAX_REDIS_RECONNECT_ATTEMPTS) {
        redisSubscriberReconnectAttempts++;
        console.log(
          "[Redis Pub/Sub] Connection ended, attempting reconnection..."
        );
        setTimeout(initializeRedisSubscriber, REDIS_RECONNECT_DELAY_MS);
      }
    });

    console.log("[Redis Pub/Sub] Subscribed to analytics completion events");
  } catch (error) {
    console.error("[Redis Pub/Sub] Failed to initialize subscriber:", error);

    // Attempt reconnection
    if (redisSubscriberReconnectAttempts < MAX_REDIS_RECONNECT_ATTEMPTS) {
      redisSubscriberReconnectAttempts++;
      console.log("[Redis Pub/Sub] Retrying initialization...");
      setTimeout(initializeRedisSubscriber, REDIS_RECONNECT_DELAY_MS);
    }
  }
}

/**
 * Handle server errors
 */
wss.on("error", (error) => {
  console.error("[WebSocket] Server error:", error);
});

/**
 * Start server
 */
server.listen(PORT, () => {
  // Initialize Redis pub/sub subscriber
  initializeRedisSubscriber();

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🎤 Voice Survey WebSocket Server                           ║
║                                                              ║
║   Port: ${PORT}                                              ║
║   Environment: ${env.NODE_ENV}                               ║
║   Voice Features: ${env.ENABLE_VOICE_FEATURES ? "✓ Enabled" : "✗ Disabled"}   ║
║                                                              ║
║   Endpoints:                                                 ║
║   • ws://localhost:${PORT}/voice/survey-creation             ║
║   • ws://localhost:${PORT}/voice/survey-response             ║
║   • ws://localhost:${PORT}/voice/sample-conversation?surveyId={id}&conversationNumber={n} ║
║   • ws://localhost:${PORT}/analytics?surveyId={id}           ║
║                                                              ║
║   Health Check: http://localhost:${PORT}/health              ║
║   Stats: http://localhost:${PORT}/stats                      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

/**
 * Graceful shutdown
 */
process.on("SIGTERM", async () => {
  console.log("[WebSocket] Received SIGTERM, shutting down gracefully...");

  // Stop the cleanup interval
  clearInterval(cleanupInterval);

  // Prevent Redis reconnection attempts during shutdown
  redisSubscriberReconnectAttempts = MAX_REDIS_RECONNECT_ATTEMPTS;

  // Unsubscribe from Redis channels
  if (redisSubscriber) {
    try {
      await redisSubscriber.punsubscribe("analytics:complete:*:*");
      await redisSubscriber.quit();
      console.log("[Redis Pub/Sub] Subscriber disconnected");
    } catch (error) {
      console.error("[Redis Pub/Sub] Error disconnecting subscriber:", error);
    }
  }

  // Close all active connections
  for (const [connectionId, { handler }] of activeConnections.entries()) {
    try {
      if (
        handler &&
        typeof (handler as { cleanup?: () => Promise<void> }).cleanup ===
          "function"
      ) {
        await (handler as { cleanup: () => Promise<void> }).cleanup();
      }
    } catch (error) {
      console.error(
        `[WebSocket] Error cleaning up connection ${connectionId}:`,
        error
      );
    }
  }

  // Close WebSocket server
  wss.close(() => {
    console.log("[WebSocket] WebSocket server closed");
  });

  // Close HTTP server
  server.close(() => {
    console.log("[WebSocket] HTTP server closed");
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error("[WebSocket] Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
});

process.on("SIGINT", async () => {
  console.log("[WebSocket] Received SIGINT, shutting down...");
  process.emit("SIGTERM");
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("[WebSocket] Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "[WebSocket] Unhandled rejection at:",
    promise,
    "reason:",
    reason
  );
});
