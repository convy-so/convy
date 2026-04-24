import { generateText } from "ai";

import type { AiContextLayer } from "@/lib/ai/context-assembler";
import {
  calculateCost,
  logUsage,
  type UsageLogInput,
} from "@/lib/billing/logger";
import {
  createAiRunTrace,
  finishAiRunTrace,
  type AiRunTraceInput,
  recordAiContextLayers,
} from "@/lib/ai/observability";
import {
  preparePromptCache,
  type PromptCacheOptions,
  type ProviderOptions,
} from "@/lib/prompt-caching";

type GenerateTextInput = Parameters<typeof generateText>[0];
type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;

type GenerateObservedTextInput = GenerateTextInput & {
  promptCache?: PromptCacheOptions;
};

export type ObservedTextOptions = AiRunTraceInput & {
  contextLayers?: AiContextLayer[];
  userId?: string | null;
  surveyId?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasNumberProperty<K extends string>(obj: unknown, key: K): obj is Record<K, number> {
  return isRecord(obj) && typeof obj[key] === "number";
}

function getModelId(model: GenerateTextInput["model"]) {
  return typeof model === "string" ? model : (model.modelId ?? "");
}

function getProviderName(model: GenerateTextInput["model"]) {
  const modelId = getModelId(model);
  return modelId.startsWith("gpt") || modelId.startsWith("o")
    ? "openai"
    : "google";
}

function mergeProviderOptions(
  current: ProviderOptions | undefined,
  prepared: ProviderOptions | undefined,
) {
  if (!current) return prepared;
  if (!prepared) return current;

  return {
    ...current,
    ...prepared,
    openai: {
      ...(isRecord(current.openai) ? current.openai : {}),
      ...(isRecord(prepared.openai) ? prepared.openai : {}),
    },
    google: {
      ...(isRecord(current.google) ? current.google : {}),
      ...(isRecord(prepared.google) ? prepared.google : {}),
    },
  } satisfies ProviderOptions;
}

function readUsageField(
  usage: GenerateTextResult["usage"],
  primaryKey: "inputTokens" | "outputTokens",
  legacyKey: "promptTokens" | "completionTokens",
) {
  if (usage && typeof usage[primaryKey] === "number") {
    return usage[primaryKey];
  }

  if (hasNumberProperty(usage, legacyKey)) {
    return usage[legacyKey];
  }

  return null;
}

function readOutputText(result: GenerateTextResult) {
  return typeof result.text === "string" && result.text.trim().length > 0
    ? result.text
    : null;
}

export async function generateObservedText(
  params: GenerateObservedTextInput,
  observability?: ObservedTextOptions,
) {
  const startedAt = Date.now();
  const { promptCache, ...rawParams } = params;
  const preparedCache = await preparePromptCache({
    model: rawParams.model,
    systemPrompt: typeof rawParams.system === "string" ? rawParams.system : undefined,
    promptCache,
  });
  const runId = observability
      ? await createAiRunTrace({
        ...observability,
        status: "running",
        userId: observability.userId ?? null,
        resourceType: observability.resourceType ?? (observability.surveyId ? "survey" : null),
        resourceId: observability.resourceId ?? observability.surveyId ?? null,
        modelProvider: observability.modelProvider ?? getProviderName(rawParams.model),
        modelName: observability.modelName ?? getModelId(rawParams.model),
      })
    : null;

  if (runId && observability?.contextLayers?.length) {
    await recordAiContextLayers(runId, observability.contextLayers);
  }

  try {
    const result = await generateText({
      ...rawParams,
      system: preparedCache.systemPrompt ?? rawParams.system,
      providerOptions: mergeProviderOptions(
        rawParams.providerOptions as ProviderOptions | undefined,
        preparedCache.providerOptions,
      ),
    });

    const usageInput: UsageLogInput = {
      userId: observability?.userId ?? undefined,
      surveyId: observability?.surveyId ?? undefined,
      type: "llm_text",
      provider: getProviderName(rawParams.model),
      modelName: getModelId(rawParams.model),
      promptTokens: readUsageField(result.usage, "inputTokens", "promptTokens") ?? 0,
      completionTokens:
        readUsageField(result.usage, "outputTokens", "completionTokens") ?? 0,
      totalTokens: result.usage.totalTokens ?? undefined,
      inputNoCacheTokens: result.usage.inputTokenDetails?.noCacheTokens,
      cacheReadTokens: result.usage.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: result.usage.inputTokenDetails?.cacheWriteTokens,
    };

    logUsage(usageInput);

    if (runId) {
      await finishAiRunTrace(runId, {
        status: "completed",
        outputText: readOutputText(result),
        latencyMs: Date.now() - startedAt,
        promptTokens: readUsageField(result.usage, "inputTokens", "promptTokens"),
        completionTokens: readUsageField(
          result.usage,
          "outputTokens",
          "completionTokens",
        ),
        totalTokens: result.usage.totalTokens ?? null,
        estimatedCostUsd: calculateCost(usageInput),
      });
    }

    return {
      ...result,
      aiRunId: runId,
    };
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
