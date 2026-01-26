import { IncomingMessage } from "http";
import { WebSocket } from "ws";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";

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
  role: "user" | "admin" | "org_admin" | "org_member"; // Added role for Issue 5
}

export interface AuthError {
  code: string;
  message: string;
}

/**
 * Extract session token from WebSocket request
 */
function extractSessionToken(request: IncomingMessage): string | null {
  // Try to get token from query parameters
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const tokenFromQuery = url.searchParams.get("token");
  if (tokenFromQuery) return tokenFromQuery;

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
        return decodeURIComponent(rawToken);
      } catch {
        return rawToken;
      }
    }
  }

  // Try to get token from Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Verify session token and get user info
 */
async function verifySessionToken(token: string): Promise<{
  userId: string;
  sessionId: string;
  userEmail: string;
  emailVerified: boolean;
  role: "user" | "admin" | "org_admin" | "org_member";
} | null> {
  try {
    console.log(`[WS Auth] Verifying token: ${token.substring(0, 5)}...${token.substring(token.length - 5)}`);
    
    // Query session from database - check both token and id
    const [session] = await db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
        token: sessions.token,
      })
      .from(sessions)
      .where(eq(sessions.token, token))
      .limit(1);

    if (!session) {
      console.log(`[WS Auth] No session found for token.`);
      // Try fallback to ID just in case the cookie contains the ID
      const [sessionById] = await db
        .select({
          id: sessions.id,
          userId: sessions.userId,
          expiresAt: sessions.expiresAt,
          token: sessions.token,
        })
        .from(sessions)
        .where(eq(sessions.id, token))
        .limit(1);
        
      if (sessionById) {
        console.log(`[WS Auth] Found session by ID fallback.`);
        // Continue with sessionById
        return processSession(sessionById);
      }
      
      return null;
    }

    return processSession(session);

    async function processSession(session: any) {
      // Check if session is expired
      const now = new Date();
      if (session.expiresAt && session.expiresAt < now) {
        console.log(`[WS Auth] Session expired. Expires at: ${session.expiresAt}, Now: ${now}`);
        return null;
      }

      // Get user details
      const [user] = await db
        .select({
          email: users.email,
          emailVerified: users.emailVerified,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

      if (!user) {
        console.log(`[WS Auth] User not found for session: ${session.userId}`);
        return null;
      }

      console.log(`[WS Auth] Session verified for user: ${user.email}`);

      return {
        userId: session.userId,
        sessionId: session.id,
        userEmail: user.email,
        emailVerified: user.emailVerified,
        role: user.role as any,
      };
    }
  } catch (error) {
    console.error("[WS Auth] Session verification error:", error);
    return null;
  }
}


/**
 * Authenticate WebSocket connection
 */
export async function authenticateWebSocket(
  ws: WebSocket,
  request: IncomingMessage
): Promise<AuthenticatedConnection | AuthError> {
  // Extract session token
  const token = extractSessionToken(request);

  if (!token) {
    return {
      code: "NO_TOKEN",
      message: "No authentication token provided",
    };
  }

  // Verify session
  const userInfo = await verifySessionToken(token);

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
 * Verify public survey access (no authentication required)
 */
export async function verifyPublicAccess(
  request: IncomingMessage
): Promise<{ surveyId: string } | AuthError> {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const surveyId = url.searchParams.get("surveyId");

  if (!surveyId) {
    return {
      code: "NO_SURVEY_ID",
      message: "Survey ID not provided",
    };
  }

  // Additional validation could be added here
  // e.g., check if survey exists and is active

  return { surveyId };
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
  console.log("[WS Auth] Sending auth error:", JSON.stringify(payload));
  ws.send(JSON.stringify(payload));
  ws.close(1008, error.message);
}

/**
 * Create authentication middleware for WebSocket server
 */
export function createAuthMiddleware(requireAuth: boolean = true) {
  return async (
    ws: WebSocket,
    request: IncomingMessage
  ): Promise<AuthenticatedConnection | { surveyId: string } | null> => {
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
  const forwarded = request.headers["x-forwarded-for"];
  if (forwarded) {
    return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
  }
  return request.socket.remoteAddress || "unknown";
}
