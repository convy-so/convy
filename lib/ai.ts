import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import {
  generateText,
  streamText,
  type ModelMessage,
  type LanguageModel,
  type StopCondition,
  type ToolSet,
  convertToModelMessages,
} from "ai";
import { logUsage } from "./billing/logger";
import { toPersistedUIChatMessages, toUIMessages } from "./chat-ui-messages";
import { preparePromptCache, type PromptCacheOptions } from "./prompt-caching";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getModelId(model: LanguageModel): string {
  return typeof model === "string" ? model : (model.modelId ?? "");
}

function getTokenCount(
  usage: unknown,
  primaryKey: "inputTokens" | "outputTokens",
  legacyKey: "promptTokens" | "completionTokens",
): number {
  if (isRecord(usage) && typeof usage[primaryKey] === "number") {
    return usage[primaryKey];
  }

  if (isRecord(usage) && typeof usage[legacyKey] === "number") {
    return usage[legacyKey];
  }

  return 0;
}

export async function normalizeMessages(
  messages: unknown[],
): Promise<ModelMessage[]> {
  return await convertToModelMessages(
    toUIMessages(
      toPersistedUIChatMessages(messages, [
        "user",
        "assistant",
        "system",
        "tool",
      ]),
    ).map((message) => {
      const { id, ...normalizedMessage } = message;
      void id;
      return normalizedMessage;
    }),
  );
}

export const GEMINI_FLASH_LITE_ID = "gemini-2.5-flash-lite";
export const GEMINI_FLASH_ID = "gemini-2.5-flash";
export const GPT_4_1_MINI_ID = "gpt-4.1-mini";

export const flashLiteModel = google(GEMINI_FLASH_LITE_ID);
export const flashModel = google(GEMINI_FLASH_ID);
export const gpt41MiniModel = openai(GPT_4_1_MINI_ID);

// Use flash for analysis (high-volume background calls)
export const analysisModel = flashModel;

export const defaultModel = gpt41MiniModel;

function getProviderName(model: LanguageModel) {
  const modelId = getModelId(model);
  return modelId.startsWith("gpt") || modelId.startsWith("o")
    ? "openai"
    : "google";
}

export async function generateAIResponse(
  prompt: string,
  systemPrompt?: string,
  options?: {
    model?: LanguageModel;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
    organizationId?: string;
    surveyId?: string;
    promptCache?: PromptCacheOptions;
  },
) {
  const model = options?.model ?? defaultModel;
  const preparedCache = await preparePromptCache({
    model,
    systemPrompt,
    promptCache: options?.promptCache,
  });

  const result = await generateText({
    model,
    prompt,
    system: preparedCache.systemPrompt,
    temperature: options?.temperature ?? 0.7,
    maxOutputTokens: options?.maxTokens ?? 2000,
    providerOptions: preparedCache.providerOptions,
  });

  logUsage({
    userId: options?.userId,
    organizationId: options?.organizationId,
    surveyId: options?.surveyId,
    type: "llm_text",
    provider: getProviderName(model),
    modelName: getModelId(model) || GEMINI_FLASH_ID,
    promptTokens: getTokenCount(result.usage, "inputTokens", "promptTokens"),
    completionTokens: getTokenCount(
      result.usage,
      "outputTokens",
      "completionTokens",
    ),
    totalTokens: result.usage.totalTokens,
    inputNoCacheTokens: result.usage.inputTokenDetails?.noCacheTokens,
    cacheReadTokens: result.usage.inputTokenDetails?.cacheReadTokens,
    cacheWriteTokens: result.usage.inputTokenDetails?.cacheWriteTokens,
  });

  return result.text;
}

/**
 * Stream text for real-time conversations
 */
export function streamAIResponse(
  messages: ModelMessage[],
  systemPrompt: string,
  options?: {
    model?: LanguageModel;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
    organizationId?: string;
    surveyId?: string;
    promptCache?: PromptCacheOptions;
    tools?: ToolSet;
    stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
  },
) {
  const model = options?.model ?? defaultModel;

  const preparedCachePromise = preparePromptCache({
    model,
    systemPrompt,
    promptCache: options?.promptCache,
  });

  return streamText({
    model,
    messages,
    system: undefined,
    temperature: options?.temperature ?? 0.7,
    maxOutputTokens: options?.maxTokens ?? 2000,
    ...(options?.tools ? { tools: options.tools } : {}),
    ...(options?.stopWhen ? { stopWhen: options.stopWhen } : {}),
    prepareStep: async () => {
      const preparedCache = await preparedCachePromise;
      return {
        system: preparedCache.systemPrompt,
        providerOptions: preparedCache.providerOptions,
      };
    },
    onFinish: (result) => {
      logUsage({
        userId: options?.userId,
        organizationId: options?.organizationId,
        surveyId: options?.surveyId,
        type: "llm_text",
        provider: getProviderName(model),
        modelName: getModelId(model) || GEMINI_FLASH_ID,
        promptTokens: getTokenCount(
          result.usage,
          "inputTokens",
          "promptTokens",
        ),
        completionTokens: getTokenCount(
          result.usage,
          "outputTokens",
          "completionTokens",
        ),
        totalTokens: result.usage.totalTokens,
        inputNoCacheTokens: result.usage.inputTokenDetails?.noCacheTokens,
        cacheReadTokens: result.usage.inputTokenDetails?.cacheReadTokens,
        cacheWriteTokens: result.usage.inputTokenDetails?.cacheWriteTokens,
      });
    },
  });
}

import { extractAIGeneratedResponse } from "./ai-utils";

export { extractAIGeneratedResponse };
export { google };
