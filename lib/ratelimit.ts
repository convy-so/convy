
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "./env";

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

/**
 * Get client IP address from request headers
 */
export function getClientIP(request: Request): string {
  // 1. Check X-Forwarded-For (Standard for ALB)
  // AWS ALB appends the client IP to the list: client, proxy1, proxy2...
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor.split(",").map((ip) => ip.trim());
    if (ips.length > 0 && ips[0]) return ips[0];
  }

  // 2. Check X-Real-IP (Sometimes set by Nginx or other ingress)
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp;

  // 3. Fallback to common CDN headers if applicable
  const cfConnectingIP = request.headers.get("cf-connecting-ip");
  if (cfConnectingIP) return cfConnectingIP;

  return "unknown";
}