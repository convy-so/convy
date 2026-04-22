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
} from "ai";
import {
  calculateCost,
  logUsage,
  type UsageLogInput,
} from "./billing/logger";
import type { AiContextLayer } from "./ai/context-assembler";
import type { ContextBundle, PromptSpec } from "./ai-core";
import type { PromptExample } from "@/lib/ai-core/types";
import { resolvePromptExecution } from "./ai-core";
import {
  createAiRunTrace,
  finishAiRunTrace,
  type AiRunTraceInput,
  recordAiContextLayers,
  wrapToolSetWithObservability,
} from "./ai/observability";
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

async function initializeObservedRun(input: {
  model: LanguageModel;
  userId?: string;
  organizationId?: string;
  surveyId?: string;
  observability?: (AiRunTraceInput & { contextLayers?: AiContextLayer[] }) | undefined;
  systemPrompt?: string;
  staticSystemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  if (!input.observability) {
    return null;
  }

  const runId = await createAiRunTrace({
    ...input.observability,
    status: "running",
    userId: input.observability.userId ?? input.userId ?? null,
    organizationId:
      input.observability.organizationId ?? input.organizationId ?? null,
    resourceType:
      input.observability.resourceType ??
      (input.surveyId ? "survey" : null),
    resourceId: input.observability.resourceId ?? input.surveyId ?? null,
    modelProvider:
      input.observability.modelProvider ?? getProviderName(input.model),
    modelName: input.observability.modelName ?? getModelId(input.model),
    promptVersionId:
      input.observability.promptVersionId ??
      input.observability.metadata?.promptVersionId?.toString() ??
      null,
    temperature: input.observability.temperature ?? input.temperature ?? null,
    maxTokens: input.observability.maxTokens ?? input.maxTokens ?? null,
    metadata: mergeRunMetadata(
      input.observability.metadata,
      input.systemPrompt,
      input.staticSystemPrompt,
    ),
  });

  if (input.observability.contextLayers?.length) {
    await recordAiContextLayers(runId, input.observability.contextLayers);
  }

  return runId;
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
    promptSpec?: PromptSpec;
    contextBundle?: ContextBundle | null;
    observability?: AiRunTraceInput & { contextLayers?: AiContextLayer[] };
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
  const runId = await initializeObservedRun({
    model,
    userId: options?.userId,
    organizationId: options?.organizationId,
    surveyId: options?.surveyId,
    observability: options?.observability
      ? {
          ...options.observability,
          promptVersionId:
            options.observability.promptVersionId ??
            resolvedPrompt.promptVersionId,
          expertGuidanceVersionId:
            options.observability.expertGuidanceVersionId ??
            resolvedPrompt.expertGuidanceVersionId,
          userOverlayVersionId:
            options.observability.userOverlayVersionId ??
            resolvedPrompt.userOverlayVersionId,
          contextLayers:
            options.observability.contextLayers?.length
              ? options.observability.contextLayers
              : resolvedPrompt.contextLayers,
          metadata: {
            ...(options.observability.metadata ?? {}),
            promptVersionId: resolvedPrompt.promptVersionId,
            contextBundleVersionId: resolvedPrompt.contextBundleVersionId,
          },
        }
      : undefined,
    systemPrompt: resolvedPrompt.systemPrompt,
    staticSystemPrompt: options?.promptCache?.staticSystemPrompt,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
  });

  try {
    const result = await generateText({
      model,
      prompt: resolvedPrompt.prompt,
      system: preparedCache.systemPrompt,
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.maxTokens ?? 2000,
      providerOptions: preparedCache.providerOptions,
    });

    const usageInput: UsageLogInput = {
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
    };
    logUsage(usageInput);

    if (runId) {
      await finishAiRunTrace(runId, {
        status: "completed",
        outputText: maybeReadTextResult(result),
        latencyMs: Date.now() - startedAt,
        promptTokens: getTokenCount(result.usage, "inputTokens", "promptTokens"),
        completionTokens: getTokenCount(
          result.usage,
          "outputTokens",
          "completionTokens",
        ),
        totalTokens: result.usage.totalTokens ?? null,
        estimatedCostUsd: calculateCost(usageInput),
      });
    }

    return result.text;
  } catch (error) {
    if (runId) {
      await finishAiRunTrace(runId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "AI generation failed",
        latencyMs: Date.now() - startedAt,
      });
    }
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
    organizationId?: string;
    surveyId?: string;
    promptCache?: PromptCacheOptions;
    promptSpec?: PromptSpec;
    contextBundle?: ContextBundle | null;
    tools?: ToolSet;
    stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
    observability?: AiRunTraceInput & { contextLayers?: AiContextLayer[] };
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
  const runIdPromise = initializeObservedRun({
    model,
    userId: options?.userId,
    organizationId: options?.organizationId,
    surveyId: options?.surveyId,
    observability: options?.observability
      ? {
          ...options.observability,
          promptVersionId:
            options.observability.promptVersionId ??
            resolvedPrompt.promptVersionId,
          expertGuidanceVersionId:
            options.observability.expertGuidanceVersionId ??
            resolvedPrompt.expertGuidanceVersionId,
          userOverlayVersionId:
            options.observability.userOverlayVersionId ??
            resolvedPrompt.userOverlayVersionId,
          contextLayers:
            options.observability.contextLayers?.length
              ? options.observability.contextLayers
              : resolvedPrompt.contextLayers,
          metadata: {
            ...(options.observability.metadata ?? {}),
            promptVersionId: resolvedPrompt.promptVersionId,
            contextBundleVersionId: resolvedPrompt.contextBundleVersionId,
          },
        }
      : undefined,
    systemPrompt: resolvedPrompt.systemPrompt,
    staticSystemPrompt: options?.promptCache?.staticSystemPrompt,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
  });
  const observedTools = wrapToolSetWithObservability(options?.tools, runIdPromise);

  return streamText({
    model,
    messages,
    system: undefined,
    temperature: options?.temperature ?? 0.7,
    maxOutputTokens: options?.maxTokens ?? 2000,
    ...(observedTools ? { tools: observedTools } : {}),
    ...(options?.stopWhen ? { stopWhen: options.stopWhen } : {}),
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
      };
      logUsage(usageInput);
      void (async () => {
        const runId = await runIdPromise;
        if (!runId) return;
        await finishAiRunTrace(runId, {
          status: "completed",
          outputText: maybeReadTextResult(result),
          latencyMs: Date.now() - startedAt,
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
          totalTokens: result.usage.totalTokens ?? null,
          estimatedCostUsd: calculateCost(usageInput),
        });
      })();
    },
    onError: ({ error }) => {
      void (async () => {
        const runId = await runIdPromise;
        if (!runId) return;
        await finishAiRunTrace(runId, {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "AI stream failed",
          latencyMs: Date.now() - startedAt,
        });
      })();
    },
  });
}

import { extractAIGeneratedResponse } from "./ai-utils";

export { extractAIGeneratedResponse };
export { google };
