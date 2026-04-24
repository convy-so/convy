import { getRedisClient } from "./redis";
import { CACHE_CONFIG } from "@/lib/config";

/**
 * Robust Redis Caching Utility
 *
 * Provides a standardized way to cache expensive operations (DB queries, API calls)
 * with automatic serialization, namespacing, and TTL management.
 */

const DEFAULT_TTL = CACHE_CONFIG.DEFAULT_TTL_SECONDS;
const inFlightCacheLoads = new Map<string, Promise<unknown>>();

export type DashboardCacheSection =
  | "stats"
  | "recentSurveys"
  | "activity";

export const cache = {
  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = getRedisClient();
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      console.error("[cache] get failed", {
        key,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  },

  /**
   * Set a value in cache with an optional TTL
   */
  async set(
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
      console.error("[cache] set failed", {
        key,
        ttlSeconds,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.del(key);
    } catch (error) {
      console.error("[cache] delete failed", {
        key,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },

  /**
   * Delete multiple keys matching a pattern
   * USE WITH CAUTION: This uses SCAN which is safe but still takes O(N) where N is number of keys
   */
  async deletePattern(pattern: string): Promise<void> {
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
      console.error("[cache] deletePattern failed", {
        pattern,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },

  /**
   * Helper to wrap an expensive operation with caching
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttlSeconds: number = DEFAULT_TTL,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const inFlight = inFlightCacheLoads.get(key);
    if (inFlight) {
      return (await inFlight) as T;
    }

    const pendingLoad = (async () => {
      const fresh = await fn();
      await this.set(key, fresh, ttlSeconds);
      return fresh;
    })();

    inFlightCacheLoads.set(key, pendingLoad);

    try {
      return await pendingLoad;
    } finally {
      if (inFlightCacheLoads.get(key) === pendingLoad) {
        inFlightCacheLoads.delete(key);
      }
    }
  },
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
