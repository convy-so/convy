import { createServer, type IncomingMessage } from "http";
import { parse } from "url";
import { loadEnvConfig } from "@next/env";
import * as Sentry from "@sentry/node";
import { WebSocket, WebSocketServer } from "ws";

import { SurveyResponseVoiceHandler } from "@/features/surveys/realtime/survey-response-voice";
import { SampleSurveyVoiceHandler } from "@/features/surveys/realtime/sample-survey-voice";
import { scrubSentryEvent } from "@/features/privacy/public-server";
import { env } from "@/shared/config/server-env";
import {
  authenticateWebSocket,
  sendAuthError,
  verifyPublicAccess,
} from "@/shared/realtime/middleware/auth";
import {
  checkConnectionAllowed,
  getClientIdentifier,
  releaseConnection,
} from "@/shared/realtime/middleware/rate-limit";
import { createRealtimeRuntime } from "@/shared/realtime/server-realtime-runtime";

const projectDir = process.cwd();
loadEnvConfig(projectDir);

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

const PORT = Number.parseInt(env.WEBSOCKET_PORT, 10);
const CLEANUP_INTERVAL_MS = 60000;
const MAX_CONNECTION_AGE_MS = 4 * 60 * 60 * 1000;

type ManagedVoiceHandler = {
  initialize: () => Promise<void>;
  getSocket: () => WebSocket | null;
};

type ActiveConnection = {
  handler: ManagedVoiceHandler;
  userId?: string;
  createdAt: number;
};

const activeConnections = new Map<string, ActiveConnection>();
const realtimeRuntime = createRealtimeRuntime();

function getSingleQueryParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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

function cleanupStaleConnections(): void {
  const now = Date.now();

  for (const [connectionId, connection] of activeConnections) {
    try {
      const ws = connection.handler.getSocket();
      const isClosed = ws && ws.readyState === WebSocket.CLOSED;
      const isTooOld = now - connection.createdAt > MAX_CONNECTION_AGE_MS;

      if (isClosed || isTooOld) {
        closeVoiceHandlerConnection(connection.handler);
        activeConnections.delete(connectionId);
      }
    } catch (error) {
      Sentry.logger.error("WebSocket stale connection cleanup failed", {
        service: "websocket-server",
        connection_id: connectionId,
        error_message: error instanceof Error ? error.message : String(error),
      });
      activeConnections.delete(connectionId);
    }
  }

  realtimeRuntime.cleanupClosedConnections();
}

const cleanupInterval = setInterval(cleanupStaleConnections, CLEANUP_INTERVAL_MS);

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        activeConnections: activeConnections.size,
        realtimeConnections: realtimeRuntime.getConnectionCount(),
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

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

wss.on("connection", (ws: WebSocket, req) => {
  void (async () => {
    const url = parse(req.url || "", true);
    const pathname = url.pathname || "";

    try {
      if (pathname === "/voice/survey-response") {
        await handleSurveyResponse(ws, req);
      } else if (pathname === "/voice/sample-conversation") {
        await handleSampleConversation(ws, req);
      } else if (pathname === "/realtime") {
        await realtimeRuntime.handleConnection(ws, req);
      } else {
        ws.send(JSON.stringify({ type: "error", error: "Invalid endpoint" }));
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
  const identifier = getClientIdentifier(req);
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
    const url = parse(req.url || "", true);
    const language = getSingleQueryParam(url.query?.language) || "en";
    const handler = new SurveyResponseVoiceHandler(
      ws,
      surveyId,
      conversationId,
      identifier,
      language,
    );
    await handler.initialize();

    const connectionId = `response-${surveyId}-${Date.now()}`;
    activeConnections.set(connectionId, { handler, createdAt: Date.now() });

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

async function handleSampleConversation(
  ws: WebSocket,
  req: IncomingMessage,
): Promise<void> {
  const authResult = await authenticateWebSocket(ws, req);
  if ("code" in authResult) {
    sendAuthError(ws, authResult);
    return;
  }

  const connection = authResult;
  const url = parse(req.url || "", true);
  const surveyId = getSingleQueryParam(url.query?.surveyId);
  const conversationNumber = Number.parseInt(
    getSingleQueryParam(url.query?.conversationNumber) || "1",
    10,
  );

  if (!surveyId) {
    ws.send(JSON.stringify({ type: "error", error: "Survey ID required" }));
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

wss.on("error", (error) => {
  Sentry.logger.error("WebSocket server error", {
    service: "websocket-server",
    error_message: error instanceof Error ? error.message : String(error),
  });
});

server.listen(PORT, () => {
  realtimeRuntime.initializeRedisSubscriber();

  if (env.SENTRY_TEST_TRIGGER) {
    throw new Error(
      "Sentry Test WebSocket Error: This is a test error from the WebSocket process.",
    );
  }
});

async function shutdownServer(): Promise<void> {
  clearInterval(cleanupInterval);
  await realtimeRuntime.shutdown();

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

  wss.close(() => {});

  server.close(() => {
    process.exit(0);
  });

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
