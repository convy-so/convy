import { getRedisClient } from "@/lib/redis";

const CACHE_PREFIX = "intl:translation:";
const CACHE_TTL = 30 * 24 * 60 * 60;

/**
 * Get a cached translation
 */
export async function getCachedTranslation(
  text: string,
  targetLanguage: string,
): Promise<string | null> {
  const redis = getRedisClient();
  const key = `${CACHE_PREFIX}${targetLanguage}:${Buffer.from(text).toString("base64")}`;
  try {
    return await redis.get(key);
  } catch (error) {
    console.error("[Translation Cache] Get error:", error);
    return null;
  }
}

/**
 * Set a cached translation
 */
export async function setCachedTranslation(
  text: string,
  targetLanguage: string,
  translation: string,
): Promise<void> {
  const redis = getRedisClient();
  const key = `${CACHE_PREFIX}${targetLanguage}:${Buffer.from(text).toString("base64")}`;
  try {
    // ioredis uses 'EX' for expiry in seconds
    await redis.set(key, translation, "EX", CACHE_TTL);
  } catch (error) {
    console.error("[Translation Cache] Set error:", error);
  }
}
