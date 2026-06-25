import { generateText } from "ai";

import {
  logUsage,
  type UsageLogInput,
} from "@/shared/billing/logger";
import {
  preparePromptCache,
  type PromptCacheOptions,
  type ProviderOptions,
} from "@/shared/ai/prompt-caching";

type GenerateTextInput = Parameters<typeof generateText>[0];
type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;

type GenerateObservedTextInput = GenerateTextInput & {
  promptCache?: PromptCacheOptions;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isJsonValue(value: unknown): value is ProviderOptions[string][string] {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
}

function normalizeProviderOptions(value: unknown): ProviderOptions | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).flatMap(([providerName, providerValue]) => {
    if (!isRecord(providerValue)) {
      return [];
    }

    const normalizedProvider = Object.entries(providerValue).flatMap(
      ([key, entryValue]) =>
        isJsonValue(entryValue) ? [[key, entryValue] as const] : [],
    );

    return [[providerName, Object.fromEntries(normalizedProvider)] as const];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
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

export async function generateObservedText(
  params: GenerateObservedTextInput,
) {
  const { promptCache, ...rawParams } = params;
  const preparedCache = await preparePromptCache({
    model: rawParams.model,
    systemPrompt: typeof rawParams.system === "string" ? rawParams.system : undefined,
    promptCache,
  });

  const result = await generateText({
    ...rawParams,
    system: preparedCache.systemPrompt ?? rawParams.system,
    providerOptions: mergeProviderOptions(
      normalizeProviderOptions(rawParams.providerOptions),
      preparedCache.providerOptions,
    ),
  });

  const usageInput: UsageLogInput = {
    userId: undefined,
    surveyId: undefined,
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

  await logUsage(usageInput);

  return result;
}
