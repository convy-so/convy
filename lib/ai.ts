import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import "@/lib/ai/prompt-specs";
import "@/lib/ai/retrieval-adapters";
import {
  generateText,
  streamText,
  type ModelMessage,
  type LanguageModel,
  type StopCondition,
  type ToolSet,
  convertToModelMessages,
  ToolLoopAgent,
  createAgentUIStreamResponse,
  type ToolLoopAgentOnFinishCallback,
} from "ai";
import { wrapAISDK } from "braintrust";
import {
  logUsage,
  type UsageLogInput,
} from "./billing/logger";

import type { ContextBundle, PromptSpec } from "./ai-core";
import type { PromptExample } from "@/lib/ai-core/types";
import { resolvePromptExecution } from "./ai-core";
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

export const flashLiteModel = wrapAISDK(google(GEMINI_FLASH_LITE_ID));
export const flashModel = wrapAISDK(google(GEMINI_FLASH_ID));
export const gpt41MiniModel = wrapAISDK(openai(GPT_4_1_MINI_ID));

// Use flash for analysis (high-volume background calls)
export const analysisModel = flashModel;

export const defaultModel = gpt41MiniModel;

function getProviderName(model: LanguageModel) {
  const modelId = getModelId(model);
  return modelId.startsWith("gpt") || modelId.startsWith("o")
    ? "openai"
    : "google";
}

function maybeReadTextResult(result: { text?: string | null }) {
  return typeof result.text === "string" && result.text.trim().length > 0
    ? result.text
    : null;
}

function mergeRunMetadata(
  base: Record<string, unknown> | undefined,
  systemPrompt: string | undefined,
  staticSystemPrompt: string | undefined,
) {
  return {
    ...(base ?? {}),
    ...(systemPrompt
      ? {
          dynamicSystemPromptPreview:
            systemPrompt.length > 400
              ? `${systemPrompt.slice(0, 397)}...`
              : systemPrompt,
        }
      : {}),
    ...(staticSystemPrompt
      ? {
          staticSystemPromptPreview:
            staticSystemPrompt.length > 240
              ? `${staticSystemPrompt.slice(0, 237)}...`
              : staticSystemPrompt,
        }
      : {}),
  };
}



export async function generateAIResponse(
  prompt: string,
  systemPrompt?: string,
  options?: {
    model?: LanguageModel;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
    surveyId?: string;
    promptCache?: PromptCacheOptions;
    promptSpec?: PromptSpec;
    contextBundle?: ContextBundle | null;
    dynamicExamples?: PromptExample[];
  },
) {
  // Apply rate limiting for AI operations
  if (options?.userId) {
    const { expensiveAiRateLimiter } = await import("@/lib/ratelimit");
    const { success, reset } = await expensiveAiRateLimiter.limit(options.userId);
    if (!success) {
      const resetDate = new Date(reset);
      throw new Error(
        `AI_RATE_LIMIT_EXCEEDED: Rate limit exceeded. Try again at ${resetDate.toISOString()}`
      );
    }
  }

  const model = options?.model ?? defaultModel;
  const startedAt = Date.now();
  const resolvedPrompt = resolvePromptExecution({
    prompt,
    systemPrompt,
    promptSpec: options?.promptSpec,
    contextBundle: options?.contextBundle,
    dynamicExamples: options?.dynamicExamples,
  });
  const preparedCache = await preparePromptCache({
    model,
    systemPrompt: resolvedPrompt.systemPrompt,
    promptCache: options?.promptCache,
  });


  try {
    const result = await generateText({
      model,
      prompt: resolvedPrompt.prompt,
      system: preparedCache.systemPrompt,
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.maxTokens ?? 2000,
      providerOptions: preparedCache.providerOptions,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "generate_ai_response",
        metadata: {
          ...(options?.userId ? { userId: options.userId } : {}),
          ...(options?.surveyId ? { surveyId: options.surveyId } : {}),
        },
      },
    });

    const usageInput: UsageLogInput = {
      userId: options?.userId,
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
    };
    logUsage(usageInput);



    return result.text;
  } catch (error) {

    throw error;
  }
}

export function streamAIResponse(
  messages: ModelMessage[],
  systemPrompt: string,
  options?: {
    model?: LanguageModel;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
    surveyId?: string;
    promptCache?: PromptCacheOptions;
    promptSpec?: PromptSpec;
    contextBundle?: ContextBundle | null;
    tools?: ToolSet;
    stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
    dynamicExamples?: PromptExample[];
  },
) {
  // Apply rate limiting for streaming AI operations
  const rateLimitPromise = (async () => {
    if (options?.userId) {
      const { expensiveAiRateLimiter } = await import("@/lib/ratelimit");
      const { success, reset } = await expensiveAiRateLimiter.limit(options.userId);
      if (!success) {
        const resetDate = new Date(reset);
        throw new Error(
          `AI_RATE_LIMIT_EXCEEDED: Rate limit exceeded. Try again at ${resetDate.toISOString()}`
        );
      }
    }
  })();

  const model = options?.model ?? defaultModel;
  const startedAt = Date.now();
  const resolvedPrompt = resolvePromptExecution({
    systemPrompt,
    promptSpec: options?.promptSpec,
    contextBundle: options?.contextBundle,
    dynamicExamples: options?.dynamicExamples,
  });

  const preparedCachePromise = preparePromptCache({
    model,
    systemPrompt: resolvedPrompt.systemPrompt,
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
    experimental_telemetry: {
      isEnabled: true,
      functionId: "stream_ai_response",
      metadata: {
        ...(options?.userId ? { userId: options.userId } : {}),
        ...(options?.surveyId ? { surveyId: options.surveyId } : {}),
      },
    },
    prepareStep: async () => {
      // Ensure rate limit check completes before streaming
      await rateLimitPromise;
      const preparedCache = await preparedCachePromise;
      return {
        system: preparedCache.systemPrompt,
        providerOptions: preparedCache.providerOptions,
      };
    },
    onFinish: (result) => {
      const usageInput: UsageLogInput = {
        userId: options?.userId,
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
      };
      logUsage(usageInput);

    },
    onError: ({ error }) => {

    },
  });
}

export async function streamAgentResponse<TOOLS extends ToolSet>(
  messages: unknown[],
  instructions: string,
  options: {
    model?: LanguageModel;
    tools: TOOLS;
    userId?: string;
    surveyId?: string;
    temperature?: number;
    maxTokens?: number;
    dynamicExamples?: PromptExample[];
    onFinish?: ToolLoopAgentOnFinishCallback<TOOLS>;
  },
) {
  // Apply rate limiting
  if (options.userId) {
    const { expensiveAiRateLimiter } = await import("@/lib/ratelimit");
    const { success, reset } = await expensiveAiRateLimiter.limit(options.userId);
    if (!success) {
      const resetDate = new Date(reset);
      throw new Error(
        `AI_RATE_LIMIT_EXCEEDED: Rate limit exceeded. Try again at ${resetDate.toISOString()}`,
      );
    }
  }

  const model = options.model ?? defaultModel;

  // Merge dynamic few-shot examples (from DB) into the instructions string
  const resolvedInstructions = options.dynamicExamples?.length
    ? resolvePromptExecution({
        systemPrompt: instructions,
        dynamicExamples: options.dynamicExamples,
      }).systemPrompt
    : instructions;

  const agent = new ToolLoopAgent({
    model,
    tools: options.tools,
    instructions: resolvedInstructions,
    temperature: options.temperature ?? 0.3,
    maxOutputTokens: options.maxTokens ?? 1000,
    onFinish: (result) => {
      // Usage logging
      const usageInput: UsageLogInput = {
        userId: options.userId,
        surveyId: options.surveyId,
        type: "agent_loop",
        provider: getProviderName(model),
        modelName: getModelId(model) || GEMINI_FLASH_ID,
        promptTokens: getTokenCount(result.totalUsage, "inputTokens", "promptTokens"),
        completionTokens: getTokenCount(
          result.totalUsage,
          "outputTokens",
          "completionTokens",
        ),
        totalTokens: result.totalUsage.totalTokens,
      };
      logUsage(usageInput);

      if (options.onFinish) {
        return options.onFinish(result);
      }
    },
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
  });
}

import { extractAIGeneratedResponse } from "./ai-utils";

export { extractAIGeneratedResponse };
export { google };
