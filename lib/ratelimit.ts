
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "./env";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export const chatRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  analytics: true,
  prefix: "@upstash/ratelimit/chat",
});

export const apiRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "10 m"),
  analytics: true,
  prefix: "@upstash/ratelimit/api",
});

export const authRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "10 m"),
  analytics: true,
  prefix: "@upstash/ratelimit/auth",
});

export const uploadRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(12, "10 m"),
  analytics: true,
  prefix: "@upstash/ratelimit/upload",
});

export const expensiveAiRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "10 m"),
  analytics: true,
  prefix: "@upstash/ratelimit/expensive-ai",
});

/**
 * Get client IP address from request headers
 */
export function getClientIP(request: Request): string {
  return resolveTrustedClientIp(request.headers).ip || "unknown";
}
