import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "./env";

// Initialize Redis client
const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

// Rate limiter for survey chat endpoints
// Allows 20 requests per 1 minute per IP address
export const chatRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  analytics: true,
  prefix: "@upstash/ratelimit/chat",
});

// Rate limiter for general API endpoints
// Allows 100 requests per 10 minutes per IP address
export const apiRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "10 m"),
  analytics: true,
  prefix: "@upstash/ratelimit/api",
});

/**
 * Get client IP address from request headers
 */
export function getClientIP(request: Request): string {
  // Check various headers for IP address (in order of preference)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  const cfConnectingIP = request.headers.get("cf-connecting-ip");
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Fallback to a default identifier if no IP is found
  return "unknown";
}

