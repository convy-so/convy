import { IncomingMessage } from "http";
import { WebSocket } from "ws";
import { getDb } from "@/db";
import { sessions, users, surveys } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRedisClient } from "@/lib/redis";
import {
  RESPONDENT_RESUME_QUERY_PARAM,
  resolveRespondentAccess,
} from "@/lib/privacy/respondent";
import { resolveTrustedNodeClientIp } from "@/lib/security/client-ip";
import { getPlatformRole, type PlatformRole, AuthError as DalAuthError } from "@/lib/auth/roles";
import { assertPermission } from "@/lib/auth/policy";

type WebsocketPrincipal = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: PlatformRole;
};

/**
 * WebSocket Authentication Middleware
 * Verifies session tokens from Better Auth
 */

export interface AuthenticatedConnection {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  userEmail: string;
  emailVerified: boolean;
  role: PlatformRole;
}

export interface AuthError {
  code: string;
  message: string;
}

/**
 * Extract session token from WebSocket request
 */
function extractSessionToken(
  request: IncomingMessage,
): { token: string; source: "query" | "cookie" | "authorization" } | null {
  // Try to get token from query parameters
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const tokenFromQuery = url.searchParams.get("token");
  if (tokenFromQuery) {
    return { token: tokenFromQuery, source: "query" };
  }

  // Try to get token from cookies
  const cookies = request.headers.cookie;
  if (cookies) {
    const cookieName = "better-auth.session_token=";
    const sessionCookie = cookies
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(cookieName));

    if (sessionCookie) {
      const rawToken = sessionCookie.substring(cookieName.length);
      try {
        return { token: decodeURIComponent(rawToken), source: "cookie" };
      } catch {
        return { token: rawToken, source: "cookie" };
      }
    }
  }

  // Try to get token from Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return { token: authHeader.substring(7), source: "authorization" };
  }

  return null;
}

async function resolveSessionToken(token: string): Promise<string | null> {
  if (!token.startsWith("ws_")) {
    return token;
  }

  try {
    const redis = getRedisClient();
    const cacheKey = `ws_ticket:${token}`;
    const resolvedToken = await redis.get(cacheKey);
    if (!resolvedToken) {
      return null;
    }

    // One-time ticket semantics.
    await redis.del(cacheKey);
    return resolvedToken;
  } catch {
    return null;
  }
}

/**
 * Verify session token and get user info
 */
async function verifySessionToken(token: string): Promise<{
  userId: string;
  sessionId: string;
  userEmail: string;
  emailVerified: boolean;
  role: PlatformRole;
} | null> {
  try {
    const resolvedToken = await resolveSessionToken(token);
    if (!resolvedToken) {
      return null;
    }


    // Query session from database by session token.
    const [session] = await getDb()
      .select({
        id: sessions.id,
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
        token: sessions.token,
      })
      .from(sessions)
      .where(eq(sessions.token, resolvedToken))
      .limit(1);

    if (!session) {
      return null;
    }

    return processSession(session);

    async function processSession(session: { userId: string; id: string; expiresAt: Date | null }) {
      // Check if session is expired
      const now = new Date();
      if (session.expiresAt && session.expiresAt < now) {
        return null;
      }

      // Get user details
      const [user] = await getDb()
        .select({
          email: users.email,
          emailVerified: users.emailVerified,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

      if (!user) {
        return null;
      }

      // Determine the derived role
      const derivedRole = getPlatformRole({
        role: user.role,
        emailVerified: user.emailVerified,
      });

      return {
        userId: session.userId,
        sessionId: session.id,
        userEmail: user.email,
        emailVerified: user.emailVerified,
        role: derivedRole,
      };
    }
  } catch {
    return null;
  }
}

/**
 * Authenticate WebSocket connection
 */
export async function authenticateWebSocket(
  ws: WebSocket,
  request: IncomingMessage,
): Promise<AuthenticatedConnection | AuthError> {
  // Extract session token
  const token = extractSessionToken(request);

  if (!token) {
    return {
      code: "NO_TOKEN",
      message: "No authentication token provided",
    };
  }

  if (token.source === "query" && !token.token.startsWith("ws_")) {
    return {
      code: "INVALID_TOKEN",
      message: "WebSocket query tokens must be short-lived auth tickets",
    };
  }

  // Verify session
  const userInfo = await verifySessionToken(token.token);

  if (!userInfo) {
    return {
      code: "INVALID_TOKEN",
      message: "Invalid or expired session token",
    };
  }

  // Check if email is verified
  if (!userInfo.emailVerified) {
    return {
      code: "EMAIL_NOT_VERIFIED",
      message: "Email not verified",
    };
  }

  try {
    const principal: WebsocketPrincipal = {
      id: userInfo.userId,
      email: userInfo.userEmail,
      emailVerified: userInfo.emailVerified,
      role: userInfo.role,
    };
    assertPermission(principal, "auth:read");
  } catch (error) {
    if (error instanceof DalAuthError) {
      return { code: error.code, message: error.message };
    }
    return { code: "UNAUTHORIZED", message: "Unauthorized" };
  }

  return {
    ws,
    userId: userInfo.userId,
    sessionId: userInfo.sessionId,
    userEmail: userInfo.userEmail,
    emailVerified: userInfo.emailVerified,
    role: userInfo.role,
  };
}

/**
 * Verify anonymous survey access backed by a respondent session.
 */
export async function verifyPublicAccess(
  request: IncomingMessage,
): Promise<{ surveyId: string; conversationId: string } | AuthError> {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const surveyId = url.searchParams.get("surveyId");
  const conversationId = url.searchParams.get("conversationId");

  if (!surveyId) {
    return {
      code: "NO_SURVEY_ID",
      message: "Survey ID not provided",
    };
  }

  if (!conversationId) {
    return {
      code: "NO_CONVERSATION_ID",
      message: "Conversation ID not provided",
    };
  }

  const survey = await getDb()
    .select({
      id: surveys.id,
      status: surveys.status,
    })
    .from(surveys)
    .where(eq(surveys.shareableLink, surveyId))
    .then((rows) => rows[0]);

  if (!survey) {
    return {
      code: "SURVEY_NOT_FOUND",
      message: "Survey not found",
    };
  }

  if (survey.status !== "active") {
    return {
      code: "SURVEY_INACTIVE",
      message: "Survey is not active",
    };
  }

  const respondentAccess = await resolveRespondentAccess({
    cookieHeader: request.headers.cookie ?? null,
    surveyId: survey.id,
    conversationId,
    clientIp:
      resolveTrustedNodeClientIp({
        headers: request.headers,
        socketRemoteAddress: request.socket.remoteAddress,
      }).ip ?? null,
    userAgent:
      Array.isArray(request.headers["user-agent"])
        ? request.headers["user-agent"][0] ?? null
        : request.headers["user-agent"] ?? null,
    explicitToken:
      url.searchParams.get(RESPONDENT_RESUME_QUERY_PARAM) ??
      url.searchParams.get("respondentToken"),
    sessionAllowedScopes: ["respondent_session"],
    explicitAllowedScopes: [
      "respondent_resume",
      "respondent_self_service",
      "respondent_session",
    ],
  });

  if (!respondentAccess) {
    return {
      code: "RESPONDENT_UNAUTHORIZED",
      message: "Respondent session required",
    };
  }

  return { surveyId, conversationId };
}

/**
 * Send authentication error to WebSocket client
 */
export function sendAuthError(ws: WebSocket, error: AuthError): void {
  const payload = {
    type: "error",
    error: {
      code: error.code,
      message: error.message,
    },
  };
  ws.send(JSON.stringify(payload));
  ws.close(1008, error.message);
}

/**
 * Create authentication middleware for WebSocket server
 */
export function createAuthMiddleware(requireAuth: boolean = true) {
  return async (
    ws: WebSocket,
    request: IncomingMessage,
  ): Promise<AuthenticatedConnection | { surveyId: string; conversationId: string } | null> => {
    if (requireAuth) {
      const result = await authenticateWebSocket(ws, request);

      if ("code" in result) {
        sendAuthError(ws, result);
        return null;
      }

      return result;
    } else {
      // Public access for survey responses
      const result = await verifyPublicAccess(request);

      if ("code" in result) {
        sendAuthError(ws, result);
        return null;
      }

      return result;
    }
  };
}

/**
 * DEPRECATED: Use rate-limit.ts instead
 * Kept for backward compatibility during migration
 */

/**
 * Get client IP address from request
 */
export function getClientIP(request: IncomingMessage): string {
  return (
    resolveTrustedNodeClientIp({
      headers: request.headers,
      socketRemoteAddress: request.socket.remoteAddress,
    }).ip || "unknown"
  );
}

