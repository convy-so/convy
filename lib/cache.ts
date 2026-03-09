import { getRedisClient } from "./redis";

/**
 * Robust Redis Caching Utility
 *
 * Provides a standardized way to cache expensive operations (DB queries, API calls)
 * with automatic serialization, namespacing, and TTL management.
 */

const DEFAULT_TTL = 3600; // 1 hour

export const cache = {
  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = getRedisClient();
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      console.error(`[Cache] Error getting key "${key}":`, error);
      return null;
    }
  },

  /**
   * Set a value in cache with an optional TTL
   */
  async set(
    key: string,
    value: any,
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
      console.error(`[Cache] Error setting key "${key}":`, error);
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
      console.error(`[Cache] Error deleting key "${key}":`, error);
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
      console.error(`[Cache] Error deleting pattern "${pattern}":`, error);
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

    const fresh = await fn();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  },
};

/**
 * Standardized key generators to avoid collisions and make invalidation easier
 */
export const cacheKeys = {
  dashboardStats: (userId: string, orgId?: string | null) =>
    `dash:stats:${userId}:${orgId || "pers"}`,
  dashboardRecentSurveys: (userId: string, orgId?: string | null) =>
    `dash:surveys:${userId}:${orgId || "pers"}`,
  dashboardActivity: (userId: string, orgId?: string | null) =>
    `dash:activity:${userId}:${orgId || "pers"}`,

  // Patterns for broad invalidation
  userScope: (userId: string) => `*:${userId}:*`,
  orgScope: (orgId: string) => `*:*:*:${orgId}`,
};
