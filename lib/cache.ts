
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

// Use Upstash Redis HTTP client for caching (serverless friendly)
const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export const CacheKeys = {
  subscription: (userId: string, orgId?: string | null) =>
    orgId ? `subscription:${userId}:org:${orgId}` : `subscription:${userId}`,
  entitlements: (userId: string, orgId?: string | null) =>
    orgId ? `entitlements:${userId}:org:${orgId}` : `entitlements:${userId}`,
  featureFlags: (userId: string) => `flags:${userId}`,
  usage: (userId: string, period: string, orgId?: string | null) =>
    orgId ? `usage:${userId}:${period}:org:${orgId}` : `usage:${userId}:${period}`,
} as const;

export const TTL = {
  subscription: 300, // 5 minutes
  entitlements: 60, // 1 minute
  featureFlags: 60, // 1 minute
  usage: 60, // 1 minute (for fast checking, mostly strict consistency needed though)
} as const;

export class CacheService {
  static async get<T>(key: string): Promise<T | null> {
    try {
      return await redis.get<T>(key);
    } catch (error) {
      console.error(`[Cache] Error getting key ${key}:`, error);
      return null;
    }
  }

  static async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await redis.set(key, value, { ex: ttlSeconds });
      } else {
        await redis.set(key, value);
      }
    } catch (error) {
      console.error(`[Cache] Error setting key ${key}:`, error);
    }
  }

  static async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      console.error(`[Cache] Error deleting key ${key}:`, error);
    }
  }

  /**
   * Increment a counter atomically
   */
  static async incr(key: string): Promise<number> {
    try {
      return await redis.incr(key);
    } catch (error) {
      console.error(`[Cache] Error incrementing key ${key}:`, error);
      return 0;
    }
  }
}
