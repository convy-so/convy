#!/usr/bin/env node

import { createServer } from "http";
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

/**
 * WebSocket Server for Voice-Enabled Surveys
 * Handles real-time voice interactions for survey creation and responses
 */

const PORT = parseInt(env.WEBSOCKET_PORT);

// Track active connections
const activeConnections = new Map<string, { handler: any; userId?: string }>();

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
      await handleSurveyCreation(ws, req, clientIP);
    } else if (pathname === "/voice/survey-response") {
      await handleSurveyResponse(ws, req, clientIP);
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
  req: any,
  clientIP: string
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
  req: any,
  clientIP: string
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
 * Handle server errors
 */
wss.on("error", (error) => {
  console.error("[WebSocket] Server error:", error);
});

/**
 * Start server
 */
server.listen(PORT, () => {
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

  // Close all active connections
  for (const [connectionId, { handler }] of activeConnections.entries()) {
    try {
      if (handler && typeof handler.cleanup === "function") {
        await handler.cleanup();
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
  process.emit("SIGTERM" as any);
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
