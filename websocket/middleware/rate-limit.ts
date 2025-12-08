import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";
import { IncomingMessage } from "http";

/**
 * WebSocket Rate Limiting with Upstash Redis
 * 
 * Implements multiple rate limit strategies:
 * 1. Connection rate limiting (new connections per minute)
 * 2. Concurrent connection limiting (active connections)
 * 3. Message rate limiting (messages per second)
 * 4. Audio processing rate limiting (STT/TTS requests)
 */

// ============================================================================
// Configuration
// ============================================================================

const RATE_LIMIT_CONFIG = {
  // Connection limits
  CONNECTION_PER_MINUTE: 10, // Max 10 new connections per minute
  MAX_CONCURRENT_CONNECTIONS: 5, // Max 5 active connections per user/IP

  // Message limits
  MESSAGES_PER_SECOND: 5, // Max 5 WebSocket messages per second
  MESSAGES_PER_MINUTE: 100, // Max 100 messages per minute

  // Audio processing limits
  STT_PER_MINUTE: 30, // Max 30 STT requests per minute
  TTS_PER_MINUTE: 30, // Max 30 TTS requests per minute

  // Burst protection
  AUDIO_CHUNKS_PER_SECOND: 10, // Max 10 audio chunks per second
} as const;

// ============================================================================
// Rate Limiters
// ============================================================================

/**
 * Connection Rate Limiter
 * Limits how many NEW connections a user/IP can make per minute
 */
export const connectionRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.CONNECTION_PER_MINUTE,
    "1 m"
  ),
  prefix: "ws:ratelimit:connection",
  analytics: true,
});

/**
 * Message Rate Limiter
 * Limits how many WebSocket messages a connection can send
 */
export const messageRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.MESSAGES_PER_SECOND,
    "1 s"
  ),
  prefix: "ws:ratelimit:message",
  analytics: true,
});

/**
 * Message Burst Protection
 * Limits messages per minute to prevent sustained abuse
 */
export const messageBurstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.MESSAGES_PER_MINUTE,
    "1 m"
  ),
  prefix: "ws:ratelimit:message:burst",
  analytics: true,
});

/**
 * STT Rate Limiter
 * Limits Speech-to-Text API calls to control costs
 */
export const sttRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(RATE_LIMIT_CONFIG.STT_PER_MINUTE, "1 m"),
  prefix: "ws:ratelimit:stt",
  analytics: true,
});

/**
 * TTS Rate Limiter
 * Limits Text-to-Speech API calls to control costs
 */
export const ttsRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(RATE_LIMIT_CONFIG.TTS_PER_MINUTE, "1 m"),
  prefix: "ws:ratelimit:tts",
  analytics: true,
});

/**
 * Audio Chunk Rate Limiter
 * Prevents audio chunk spam
 */
export const audioChunkRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.AUDIO_CHUNKS_PER_SECOND,
    "1 s"
  ),
  prefix: "ws:ratelimit:audio",
  analytics: true,
});

// ============================================================================
// Concurrent Connection Tracking
// ============================================================================

/**
 * Track concurrent connections using Redis
 * More reliable than in-memory Map for multi-server deployments
 */

const CONCURRENT_CONNECTION_KEY = "ws:concurrent";
const CONNECTION_TTL = 3600; // 1 hour TTL as safety net

/**
 * Increment concurrent connection count
 */
export async function incrementConcurrentConnections(
  identifier: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const key = `${CONCURRENT_CONNECTION_KEY}:${identifier}`;

  // Increment connection count
  const current = await redis.incr(key);

  // Set expiry if this is a new key (prevents memory leaks)
  if (current === 1) {
    await redis.expire(key, CONNECTION_TTL);
  }

  const allowed = current <= RATE_LIMIT_CONFIG.MAX_CONCURRENT_CONNECTIONS;

  return {
    allowed,
    current,
    limit: RATE_LIMIT_CONFIG.MAX_CONCURRENT_CONNECTIONS,
  };
}

/**
 * Decrement concurrent connection count
 */
export async function decrementConcurrentConnections(
  identifier: string
): Promise<number> {
  const key = `${CONCURRENT_CONNECTION_KEY}:${identifier}`;

  const current = await redis.decr(key);

  // Clean up if count reaches 0
  if (current <= 0) {
    await redis.del(key);
    return 0;
  }

  return current;
}

/**
 * Get current concurrent connection count
 */
export async function getConcurrentConnections(
  identifier: string
): Promise<number> {
  const key = `${CONCURRENT_CONNECTION_KEY}:${identifier}`;
  const count = await redis.get<number>(key);
  return count || 0;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if connection should be allowed
 */
export async function checkConnectionAllowed(
  identifier: string
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  // 1. Check connection rate limit (new connections per minute)
  const rateLimitResult = await connectionRateLimiter.limit(identifier);

  if (!rateLimitResult.success) {
    return {
      allowed: false,
      reason: "Too many connection attempts. Please try again later.",
      retryAfter: Math.ceil((rateLimitResult.reset - Date.now()) / 1000),
    };
  }

  // 2. Check concurrent connection limit
  const concurrentResult = await incrementConcurrentConnections(identifier);

  if (!concurrentResult.allowed) {
    // Rollback the increment
    await decrementConcurrentConnections(identifier);

    return {
      allowed: false,
      reason: `Too many concurrent connections (${concurrentResult.current}/${concurrentResult.limit}). Please close existing connections.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if message should be allowed
 */
export async function checkMessageAllowed(
  identifier: string
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  // Check per-second rate limit
  const secondResult = await messageRateLimiter.limit(identifier);

  if (!secondResult.success) {
    return {
      allowed: false,
      reason: "Sending messages too quickly. Please slow down.",
      retryAfter: Math.ceil((secondResult.reset - Date.now()) / 1000),
    };
  }

  // Check per-minute burst limit
  const minuteResult = await messageBurstLimiter.limit(identifier);

  if (!minuteResult.success) {
    return {
      allowed: false,
      reason: "Message limit exceeded. Please try again later.",
      retryAfter: Math.ceil((minuteResult.reset - Date.now()) / 1000),
    };
  }

  return { allowed: true };
}

/**
 * Check if audio chunk should be processed
 */
export async function checkAudioChunkAllowed(
  identifier: string
): Promise<{ allowed: boolean; reason?: string }> {
  const result = await audioChunkRateLimiter.limit(identifier);

  if (!result.success) {
    return {
      allowed: false,
      reason: "Sending audio too quickly. Please speak at a normal pace.",
    };
  }

  return { allowed: true };
}

/**
 * Check if STT request should be allowed
 */
export async function checkSTTAllowed(
  identifier: string
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const result = await sttRateLimiter.limit(identifier);

  if (!result.success) {
    return {
      allowed: false,
      reason: "Speech recognition rate limit exceeded. Please slow down.",
      retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
    };
  }

  return { allowed: true };
}

/**
 * Check if TTS request should be allowed
 */
export async function checkTTSAllowed(
  identifier: string
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const result = await ttsRateLimiter.limit(identifier);

  if (!result.success) {
    return {
      allowed: false,
      reason: "Text-to-speech rate limit exceeded. Please slow down.",
      retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
    };
  }

  return { allowed: true };
}

/**
 * Release connection (call on disconnect)
 */
export async function releaseConnection(identifier: string): Promise<void> {
  await decrementConcurrentConnections(identifier);
}

/**
 * Get client identifier from request
 * Uses user ID if authenticated, IP address otherwise
 */
export function getClientIdentifier(
  request: IncomingMessage,
  userId?: string
): string {
  if (userId) {
    return `user:${userId}`;
  }

  // Use IP address for unauthenticated connections
  const forwarded = request.headers["x-forwarded-for"];
  const ip = forwarded
    ? Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(",")[0]
    : request.socket.remoteAddress || "unknown";

  return `ip:${ip}`;
}

/**
 * Get rate limit analytics
 */
export async function getRateLimitStats(
  identifier: string
): Promise<{
  concurrentConnections: number;
  limits: typeof RATE_LIMIT_CONFIG;
}> {
  const concurrentConnections = await getConcurrentConnections(identifier);

  return {
    concurrentConnections,
    limits: RATE_LIMIT_CONFIG,
  };
}

// ============================================================================
// Export Configuration
// ============================================================================

export { RATE_LIMIT_CONFIG };
