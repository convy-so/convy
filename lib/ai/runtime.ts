import {
  convertToModelMessages,
  generateText,
  Output,
  streamText,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { z } from "zod";

import type { PromptExample, PromptSpec } from "@/lib/ai-core/types";
import { resolvePromptExecution } from "@/lib/ai-core/prompting";
import type { ContextBundle } from "@/lib/ai-core/types";
import { logUsage, type UsageLogInput } from "@/lib/billing/logger";
import { tutorAnalysisModel, tutorChatModel } from "@/lib/ai/models";
import { preparePromptCache, type PromptCacheOptions } from "@/lib/prompt-caching";
import * as Sentry from "@sentry/nextjs";
import { createLogger, serializeError } from "@/lib/logger";

const log = createLogger("ai-runtime");


type StructuredGenerationParams<TSchema extends z.ZodTypeAny> = {
  schema: TSchema;
  prompt: string;
  system?: string;
  model?: LanguageModel;
  temperature?: number;
  maxOutputTokens?: number;
  promptSpec?: PromptSpec;
  dynamicExamples?: PromptExample[];
  contextBundle?: ContextBundle | null;
  promptCache?: PromptCacheOptions;
};

type StreamUiTextParams = {
  messages: UIMessage[];
  system: string;
  model?: LanguageModel;
  temperature?: number;
  maxOutputTokens?: number;
  promptSpec?: PromptSpec;
  dynamicExamples?: PromptExample[];
  contextBundle?: ContextBundle | null;
  promptCache?: PromptCacheOptions;
};

export async function generateStructuredOutput<TSchema extends z.ZodTypeAny>(
  params: StructuredGenerationParams<TSchema>,
): Promise<z.infer<TSchema>> {
  const model = params.model ?? tutorAnalysisModel;
  const resolvedPrompt = resolvePromptExecution({
    prompt: params.prompt,
    systemPrompt: params.system,
    promptSpec: params.promptSpec,
    dynamicExamples: params.dynamicExamples,
    contextBundle: params.contextBundle,
  });
  const preparedCache = await preparePromptCache({
    model,
    systemPrompt: resolvedPrompt.systemPrompt,
    promptCache: params.promptCache,
  });

  try {
    const result = await generateText({
      model,
      system: preparedCache.systemPrompt,
      prompt: resolvedPrompt.prompt,
      temperature: params.temperature ?? 0.2,
      maxOutputTokens: params.maxOutputTokens ?? 1500,
      providerOptions: preparedCache.providerOptions,
      output: Output.object({
        schema: params.schema,
      }),
    });

    const usageInput: UsageLogInput = {
      type: "llm_text",
      provider: getProviderName(model),
      modelName: getModelId(model),
      promptTokens: getTokenCount(result.usage, "inputTokens", "promptTokens"),
      completionTokens: getTokenCount(
        result.usage,
        "outputTokens",
        "completionTokens",
      ),
      totalTokens: result.usage.totalTokens,
    };
    logUsage(usageInput);

    return result.output;
  } catch (err) {
    log.error("Structured output generation failed", serializeError(err));
    Sentry.captureException(err, { tags: { service: "ai-runtime" } });
    throw err;
  }
}

export async function streamUiText(params: StreamUiTextParams) {
  const messages = await convertToModelMessages(params.messages);
  const resolvedPrompt = resolvePromptExecution({
    systemPrompt: params.system,
    promptSpec: params.promptSpec,
    dynamicExamples: params.dynamicExamples,
    contextBundle: params.contextBundle,
  });
  const preparedCachePromise = preparePromptCache({
    model: params.model ?? tutorChatModel,
    systemPrompt: resolvedPrompt.systemPrompt,
    promptCache: params.promptCache,
  });
  return streamText({
    model: params.model ?? tutorChatModel,
    system: undefined,
    messages,
    temperature: params.temperature ?? 0.3,
    maxOutputTokens: params.maxOutputTokens ?? 900,
    prepareStep: async () => {
      const preparedCache = await preparedCachePromise;
      return {
        system: preparedCache.systemPrompt,
        providerOptions: preparedCache.providerOptions,
      };
    },
  });
}

function getModelId(model: LanguageModel): string {
  return typeof model === "string" ? model : (model.modelId ?? "");
}

function getProviderName(model: LanguageModel) {
  const modelId = getModelId(model);
  return modelId.startsWith("gpt") || modelId.startsWith("o")
    ? "openai"
    : "google";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
