import { getRedisClient } from "@/shared/infra/redis";
import { CACHE_CONFIG } from "@/shared/config/app-config";
import { createLogger } from "@/shared/infra/logger";
import { parseJsonValue } from "@/shared/http/json";

const log = createLogger("cache");

/**
 * Robust Redis Caching Utility
 *
 * Provides a standardized way to cache expensive operations (DB queries, API calls)
 * with automatic serialization, namespacing, and TTL management.
 */

const DEFAULT_TTL = CACHE_CONFIG.DEFAULT_TTL_SECONDS;

export type DashboardCacheSection =
  | "stats"
  | "recentSurveys"
  | "activity";

type CacheValidator<T> = (value: unknown) => value is T;

async function getCachedValue(key: string): Promise<unknown>;
async function getCachedValue<T>(
  key: string,
  isValue: CacheValidator<T>,
): Promise<T | null>;
async function getCachedValue<T>(
  key: string,
  isValue?: CacheValidator<T>,
): Promise<unknown> {
  try {
    const redis = getRedisClient();
    const data = await redis.get(key);
    if (!data) return null;
    const parsed = parseJsonValue(data);
    if (!isValue) {
      return parsed;
    }
    return isValue(parsed) ? parsed : null;
  } catch (error) {
    log.error("Cache get failed", {
      cache_key: key,
      error_message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function setCachedValue(
  key: string,
  value: unknown,
  ttlSeconds: number = DEFAULT_TTL,
): Promise<void> {
  try {
    const redis = getRedisClient();
    const serialized = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await redis.set(key, serialized, "EX", ttlSeconds);
    } else {
      await redis.set(key, serialized);
    }
  } catch (error) {
    log.error("Cache set failed", {
      cache_key: key,
      ttl_seconds: ttlSeconds,
      error_message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function deleteCachedValue(key: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch (error) {
    log.error("Cache delete failed", {
      cache_key: key,
      error_message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function deleteCachedPattern(pattern: string): Promise<void> {
  try {
    const redis = getRedisClient();
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch (error) {
    log.error("Cache deletePattern failed", {
      pattern,
      error_message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function wrapCachedValue<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL,
  isValue?: CacheValidator<T>,
): Promise<T> {
  const validator: CacheValidator<T> =
    isValue ?? ((_: unknown): _ is T => true);
  const cached = await getCachedValue(key, validator);
  if (cached !== null) {
    return cached;
  }

  const fresh = await fn();
  await setCachedValue(key, fresh, ttlSeconds);
  return fresh;
}

export const cache = {
  get: getCachedValue,
  set: setCachedValue,
  delete: deleteCachedValue,
  deletePattern: deleteCachedPattern,
  wrap: wrapCachedValue,
};

/**
 * Standardized key generators to avoid collisions and make invalidation easier
 */
export const cacheKeys = {
  dashboardStats: (userId: string) => `dash:stats:user:${userId}`,
  dashboardRecentSurveys: (userId: string) => `dash:surveys:user:${userId}`,
  dashboardActivity: (userId: string) => `dash:activity:user:${userId}`,

  // Patterns for broad invalidation
  userScope: (userId: string) => `*:${userId}:*`,
};

export async function invalidateDashboardCaches(
  userId: string,
  _scopeId?: string | null,
  sections: DashboardCacheSection[] = ["stats", "recentSurveys", "activity"],
): Promise<void> {
  const uniqueSections = new Set(sections);
  const keys = Array.from(uniqueSections, (section) => {
    switch (section) {
      case "stats":
        return cacheKeys.dashboardStats(userId);
      case "recentSurveys":
        return cacheKeys.dashboardRecentSurveys(userId);
      case "activity":
        return cacheKeys.dashboardActivity(userId);
    }
  });

  await Promise.all(keys.map((key) => cache.delete(key)));
}
