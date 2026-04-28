

import { createHash } from "node:crypto";

import type { LanguageModel } from "ai";
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };
export type ProviderOptions = Record<string, { [key: string]: JsonValue | undefined }>;

import { env } from "@/lib/env";
import { getRedisClient } from "@/lib/redis";

const GOOGLE_CACHE_TTL_SECONDS = 60 * 60;
const GOOGLE_CACHE_REFRESH_WINDOW_SECONDS = 5 * 60;
// Keep this low enough that our reusable tutoring/survey prompt frames
// can participate in provider-side caching, while still avoiding tiny,
// low-signal prefixes that would churn cache keys.
const MIN_CACHEABLE_PREFIX_CHARS = 1400;

export type PromptCacheOptions = {
  namespace: string;
  staticSystemPrompt?: string;
  staticPromptPrefix?: string;
  ttlSeconds?: number;
};

type PromptCachePreparation = {
  providerOptions?: ProviderOptions;
  systemPrompt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getModelId(model: LanguageModel): string {
  return typeof model === "string" ? model : model.modelId ?? "";
}

function isOpenAIModel(modelId: string) {
  return modelId.startsWith("gpt") || modelId.startsWith("o");
}

function isGeminiModel(modelId: string) {
  return modelId.startsWith("gemini");
}

function isCacheablePrefix(value?: string | null) {
  return Boolean(value && value.trim().length >= MIN_CACHEABLE_PREFIX_CHARS);
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildOpenAIPromptCacheKey(input: {
  namespace: string;
  modelId: string;
  stablePrefix: string;
}) {
  return `convy:${input.namespace}:${input.modelId}:${stableHash(input.stablePrefix).slice(0, 24)}`;
}

async function getOrCreateGoogleCachedContent(input: {
  namespace: string;
  modelId: string;
  systemInstruction: string;
  ttlSeconds: number;
}) {
  const normalizedModel = input.modelId.startsWith("models/")
    ? input.modelId
    : `models/${input.modelId}`;
  const contentHash = stableHash(
    `${normalizedModel}\n${input.namespace}\n${input.systemInstruction}`,
  );
  const redis = getRedisClient();
  const redisKey = `prompt-cache:google:${contentHash}`;
  const lockKey = `${redisKey}:lock`;

  function parseCachedContentMetadata(value: unknown): {
    cachedContent: string;
    expiresAt: string;
  } | null {
    if (
      !isRecord(value) ||
      typeof value.cachedContent !== "string" ||
      typeof value.expiresAt !== "string"
    ) {
      return null;
    }

    return {
      cachedContent: value.cachedContent,
      expiresAt: value.expiresAt,
    };
  }

  try {
    const cachedRaw = await redis.get(redisKey);
    if (typeof cachedRaw === "string" && cachedRaw.length > 0) {
      const parsed = parseCachedContentMetadata(JSON.parse(cachedRaw));
      if (
        parsed &&
        Date.parse(parsed.expiresAt) - Date.now() >
          GOOGLE_CACHE_REFRESH_WINDOW_SECONDS * 1000
      ) {
        return parsed.cachedContent;
      }
    }
  } catch {
  }

  let lockAcquired = false;
  try {
    const lockResult = await redis.set(lockKey, "1", "EX", 30, "NX");
    lockAcquired = lockResult === "OK";
  } catch {
  }

  if (!lockAcquired) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        const cachedRaw = await redis.get(redisKey);
        if (typeof cachedRaw === "string" && cachedRaw.length > 0) {
          const parsed = parseCachedContentMetadata(JSON.parse(cachedRaw));
          if (parsed?.cachedContent) {
            return parsed.cachedContent;
          }
        }
      } catch {
        break;
      }
    }

    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: normalizedModel,
            displayName: `convy-${input.namespace}-${contentHash.slice(0, 8)}`,
            systemInstruction: {
              role: "system",
              parts: [{ text: input.systemInstruction }],
            },
            ttl: `${input.ttlSeconds}s`,
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Google cachedContents create failed (${response.status}): ${errorText}`,
        );
      }

      const rawPayload = await response.json();
      if (!isRecord(rawPayload) || typeof rawPayload.name !== "string") {
        throw new Error("Google cachedContents response did not include a name");
      }

      const expiresAt =
        (typeof rawPayload.expireTime === "string" ? rawPayload.expireTime : undefined) ||
        new Date(Date.now() + input.ttlSeconds * 1000).toISOString();

      try {
        await redis.set(
          redisKey,
          JSON.stringify({
            cachedContent: rawPayload.name,
            expiresAt,
          }),
          "EX",
          Math.max(60, input.ttlSeconds - GOOGLE_CACHE_REFRESH_WINDOW_SECONDS),
        );
      } catch {
      }

      return rawPayload.name;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Google cachedContents API request timed out after 10 seconds");
      }
      throw error;
    }
  } catch {
    return null;
  } finally {
    try {
      await redis.del(lockKey);
    } catch {
      // Best effort cleanup only.
    }
  }
}

export async function preparePromptCache(input: {
  model: LanguageModel;
  systemPrompt?: string;
  promptCache?: PromptCacheOptions;
}): Promise<PromptCachePreparation> {
  const { promptCache } = input;
  if (!promptCache) {
    return { systemPrompt: input.systemPrompt };
  }

  const modelId = getModelId(input.model);
  const stablePrefix =
    promptCache.staticSystemPrompt ?? promptCache.staticPromptPrefix ?? "";
  const providerOptions: ProviderOptions = {};
  const staticSystemPrompt = promptCache.staticSystemPrompt;
  const combinedSystemPrompt =
    staticSystemPrompt &&
    staticSystemPrompt !== input.systemPrompt
      ? [staticSystemPrompt, input.systemPrompt]
          .filter((value): value is string => Boolean(value && value.trim()))
          .join("\n\n")
      : input.systemPrompt;
  let systemPrompt = combinedSystemPrompt;

  if (isCacheablePrefix(stablePrefix) && isOpenAIModel(modelId)) {
    providerOptions.openai = {
      promptCacheKey: buildOpenAIPromptCacheKey({
        namespace: promptCache.namespace,
        modelId,
        stablePrefix,
      }),
    };
  }

  if (
    staticSystemPrompt &&
    isCacheablePrefix(staticSystemPrompt) &&
    isGeminiModel(modelId)
  ) {
    const cachedContent = await getOrCreateGoogleCachedContent({
      namespace: promptCache.namespace,
      modelId,
      systemInstruction: staticSystemPrompt,
      ttlSeconds: promptCache.ttlSeconds ?? GOOGLE_CACHE_TTL_SECONDS,
    });

    if (cachedContent) {
      providerOptions.google = { cachedContent };
      systemPrompt =
        input.systemPrompt === staticSystemPrompt
          ? undefined
          : input.systemPrompt;
    }
  }

  return {
    providerOptions:
      Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
    systemPrompt,
  };
}
