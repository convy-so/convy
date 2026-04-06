import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const CACHE_PREFIX = "intl:translation:";
const CACHE_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * Get a cached translation
 */
export async function getCachedTranslation(
  text: string,
  targetLanguage: string,
): Promise<string | null> {
  const key = `${CACHE_PREFIX}${targetLanguage}:${Buffer.from(text).toString("base64")}`;
  try {
    return await redis.get<string>(key);
  } catch (error) {
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
  const key = `${CACHE_PREFIX}${targetLanguage}:${Buffer.from(text).toString("base64")}`;
  try {
    await redis.set(key, translation, { ex: CACHE_TTL });
  } catch (error) {
  }
}

