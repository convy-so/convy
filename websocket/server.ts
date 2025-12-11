#!/usr/bin/env node

import { createServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { parse } from "url";
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
      | AnalyticsHandler;
    userId?: string;
  }
>();

// Track analytics connections: userId -> surveyId -> handler
const analyticsConnections = new Map<string, Map<string, AnalyticsHandler>>();

// Redis pub/sub subscriber for analytics events
let redisSubscriber: ReturnType<typeof getRedisSubscriber> | null = null;

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

  // Stats endpoint
  if (req.url === "/stats") {
    const stats = {
      activeConnections: activeConnections.size,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(stats));
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
        error: "Internal server error",
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
  // Authenticate connection
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

    // Track connection
    const connectionId = `creation-${connection.userId}-${Date.now()}`;
    activeConnections.set(connectionId, {
      handler,
      userId: connection.userId,
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
        error: "Failed to initialize voice session",
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
  // Verify public access
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

    // Track connection
    const connectionId = `response-${surveyId}-${Date.now()}`;
    activeConnections.set(connectionId, { handler });

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
        error: "Failed to initialize voice session",
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

    // Track connection
    const connectionId = `analytics-${connection.userId}-${surveyId}-${Date.now()}`;
    activeConnections.set(connectionId, {
      handler,
      userId: connection.userId,
    });

    // Track analytics connection for Redis pub/sub routing
    if (!analyticsConnections.has(connection.userId)) {
      analyticsConnections.set(connection.userId, new Map());
    }
    analyticsConnections.get(connection.userId)!.set(surveyId, handler);

    // Handle disconnection
    ws.on("close", async () => {
      activeConnections.delete(connectionId);
      const userConnections = analyticsConnections.get(connection.userId);
      if (userConnections) {
        userConnections.delete(surveyId);
        if (userConnections.size === 0) {
          analyticsConnections.delete(connection.userId);
        }
      }
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
        error: "Failed to initialize analytics connection",
      })
    );
    ws.close();
  }
}

/**
 * Initialize Redis pub/sub subscriber for analytics events
 */
function initializeRedisSubscriber(): void {
  try {
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
          const userConnections = analyticsConnections.get(userId);
          if (userConnections) {
            const handler = userConnections.get(surveyId);
            if (handler) {
              handler.handleAnalyticsUpdate(data);
              console.log(
                `[Redis Pub/Sub] Delivered analytics update to user ${userId}, survey ${surveyId}`
              );
            }
          }
        }
      } catch (error) {
        console.error("[Redis Pub/Sub] Error processing message:", error);
      }
    });

    redisSubscriber.on("error", (error) => {
      console.error("[Redis Pub/Sub] Subscriber error:", error);
    });

    redisSubscriber.on("connect", () => {
      console.log("[Redis Pub/Sub] Subscriber connected");
    });

    console.log("[Redis Pub/Sub] Subscribed to analytics completion events");
  } catch (error) {
    console.error("[Redis Pub/Sub] Failed to initialize subscriber:", error);
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
