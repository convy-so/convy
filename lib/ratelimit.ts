
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "./env";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";
import { RATE_LIMIT_CONFIG } from "@/lib/config";

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export const chatRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.chat.max,
    RATE_LIMIT_CONFIG.chat.window
  ),
  analytics: true,
  prefix: "@upstash/ratelimit/chat",
});

export const apiRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.api.max,
    RATE_LIMIT_CONFIG.api.window
  ),
  analytics: true,
  prefix: "@upstash/ratelimit/api",
});

export const authRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.auth.max,
    RATE_LIMIT_CONFIG.auth.window
  ),
  analytics: true,
  prefix: "@upstash/ratelimit/auth",
});

export const uploadRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.upload.max,
    RATE_LIMIT_CONFIG.upload.window
  ),
  analytics: true,
  prefix: "@upstash/ratelimit/upload",
});

export const expensiveAiRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(
    RATE_LIMIT_CONFIG.expensiveAi.max,
    RATE_LIMIT_CONFIG.expensiveAi.window
  ),
  analytics: true,
  prefix: "@upstash/ratelimit/expensive-ai",
});

/**
 * Get client IP address from request headers
 */
export function getClientIP(request: Request): string {
  return resolveTrustedClientIp(request.headers).ip || "unknown";
}

export function getRateLimitKey(
  request: Request,
  options?: {
    userId?: string | null;
    scope?: string;
  },
): string {
  const clientIp = getClientIP(request);
  const subject =
    options?.userId && options.userId.trim().length > 0
      ? `user:${options.userId}`
      : `ip:${clientIp}`;

  return options?.scope ? `${options.scope}:${subject}` : subject;
}
