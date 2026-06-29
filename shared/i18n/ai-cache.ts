import { Redis } from "@upstash/redis";
import { env } from "@/shared/config/server-env";

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

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
    if (!redis) {
      return null;
    }

    return await redis.get<string>(key);
  } catch {
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
    if (!redis) {
      return;
    }

    await redis.set(key, translation, { ex: CACHE_TTL });
  } catch {
  }
}

