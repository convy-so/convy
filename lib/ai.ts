import "@/lib/ai/prompt-specs";
import {
  analysisModel,
  defaultModel,
  flashLiteModel,
  flashModel,
  gpt41MiniModel,
  GEMINI_FLASH_ID,
  GEMINI_FLASH_LITE_ID,
  GPT_4_1_MINI_ID,
  google,
} from "@/lib/ai/language-models";
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
  stepCountIs,
} from "ai";
import { logUsage, type UsageLogInput } from "./billing/logger";
import {
  logTutoringDebug,
  summarizeTutoringText,
  measureTutoringStep,
} from "@/lib/learning/tutoring-debug";

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

export {
  analysisModel,
  defaultModel,
  flashLiteModel,
  flashModel,
  gpt41MiniModel,
  GEMINI_FLASH_ID,
  GEMINI_FLASH_LITE_ID,
  GPT_4_1_MINI_ID,
  google,
};

function getProviderName(model: LanguageModel) {
  const modelId = getModelId(model);
  return modelId.startsWith("gpt") || modelId.startsWith("o")
    ? "openai"
    : "google";
}

function createUsageLogInput(
  type: UsageLogInput["type"],
  model: LanguageModel,
  usage: unknown,
  attribution?: Partial<UsageLogInput>,
): UsageLogInput {
  const usageRecord = isRecord(usage) ? usage : {};
  const inputTokenDetails = isRecord(usageRecord.inputTokenDetails)
    ? usageRecord.inputTokenDetails
    : {};

  return {
    ...(attribution ?? {}),
    type,
    provider: getProviderName(model),
    modelName: getModelId(model) || GEMINI_FLASH_ID,
    promptTokens: getTokenCount(usage, "inputTokens", "promptTokens"),
    completionTokens: getTokenCount(usage, "outputTokens", "completionTokens"),
    totalTokens: typeof usageRecord.totalTokens === "number" ? usageRecord.totalTokens : undefined,
    inputNoCacheTokens:
      typeof inputTokenDetails.noCacheTokens === "number"
        ? inputTokenDetails.noCacheTokens
        : undefined,
    cacheReadTokens:
      typeof inputTokenDetails.cacheReadTokens === "number"
        ? inputTokenDetails.cacheReadTokens
        : undefined,
    cacheWriteTokens:
      typeof inputTokenDetails.cacheWriteTokens === "number"
        ? inputTokenDetails.cacheWriteTokens
        : undefined,
  };
}

export async function generateAIResponse(
  prompt: string,
  systemPrompt?: string,
  options?: {
    model?: LanguageModel;
    temperature?: number;
    maxTokens?: number;
    attribution?: Partial<UsageLogInput>;
    promptCache?: PromptCacheOptions;
    promptSpec?: PromptSpec;
    contextBundle?: ContextBundle | null;
    dynamicExamples?: PromptExample[];
  },
) {
  const model = options?.model ?? defaultModel;
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
        ...(options?.attribution ?? {}),
      },
    },
  });

  logUsage(createUsageLogInput("llm_text", model, result.usage, options?.attribution));

  return result.text;
}

export function streamAIResponse(
  messages: ModelMessage[],
  systemPrompt: string,
  options?: {
    model?: LanguageModel;
    temperature?: number;
    maxTokens?: number;
    attribution?: Partial<UsageLogInput>;
    promptCache?: PromptCacheOptions;
    promptSpec?: PromptSpec;
    contextBundle?: ContextBundle | null;
    tools?: ToolSet;
    stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
    dynamicExamples?: PromptExample[];
  },
) {
  const model = options?.model ?? defaultModel;
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
        ...(options?.attribution ?? {}),
      },
    },
    prepareStep: async () => {
      const preparedCache = await measureTutoringStep(
        "ai:agent:prepare-cache",
        {
          model: getModelId(model),
          messageCount: Array.isArray(messages) ? messages.length : null,
        },
        async () => await preparedCachePromise,
      );
      return {
        system: preparedCache.systemPrompt,
        providerOptions: preparedCache.providerOptions,
      };
    },
    onFinish: (result) => {
      logUsage(createUsageLogInput("llm_text", model, result.usage, options?.attribution));
    },
    onError: () => {},
  });
}

export async function streamAgentResponse<TOOLS extends ToolSet>(
  messages: unknown[],
  instructions: string,
  options: {
    model?: LanguageModel;
    tools: TOOLS;
    attribution?: Partial<UsageLogInput>;
    temperature?: number;
    maxTokens?: number;
    stopWhen?: StopCondition<TOOLS> | Array<StopCondition<TOOLS>>;
    dynamicExamples?: PromptExample[];
    promptCache?: PromptCacheOptions;
    onFinish?: ToolLoopAgentOnFinishCallback<TOOLS>;
  },
) {
  const model = options.model ?? defaultModel;
  const isTutoringFeature =
    typeof options.attribution?.feature === "string" &&
    options.attribution.feature.includes("tutor");
  if (isTutoringFeature) {
    logTutoringDebug("ai:agent:start", {
      feature: options.attribution?.feature ?? null,
      model: getModelId(model),
      messageCount: Array.isArray(messages) ? messages.length : null,
      instructionLength: instructions.length,
      toolNames: Object.keys(options.tools),
      dynamicExampleCount: options.dynamicExamples?.length ?? 0,
      promptPreview: summarizeTutoringText(instructions, 180),
    });
  }

  // Merge dynamic few-shot examples (from DB) into the instructions string
  const resolvedInstructions = options.dynamicExamples?.length
    ? resolvePromptExecution({
        systemPrompt: instructions,
        dynamicExamples: options.dynamicExamples,
      }).systemPrompt
    : instructions;
  const preparedCache = await measureTutoringStep(
    "ai:agent:prepare-cache",
    {
      model: getModelId(model),
      messageCount: Array.isArray(messages) ? messages.length : null,
    },
    async () =>
      await preparePromptCache({
        model,
        systemPrompt: resolvedInstructions,
        promptCache: options.promptCache,
      }),
  );

  const agent = new ToolLoopAgent({
    model,
    tools: options.tools,
    instructions: preparedCache.systemPrompt ?? resolvedInstructions,
    temperature: options.temperature ?? 0.3,
    maxOutputTokens: options.maxTokens ?? 1000,
    stopWhen: options.stopWhen ?? stepCountIs(4),
    providerOptions: preparedCache.providerOptions,
    onFinish: (result) => {
      if (isTutoringFeature) {
        logTutoringDebug("ai:agent:finish", {
          feature: options.attribution?.feature ?? null,
          model: getModelId(model),
          stepCount: result.steps.length,
          totalUsage: result.totalUsage,
        });
      }
      logUsage(
        createUsageLogInput(
          "agent_loop",
          model,
          result.totalUsage,
          options.attribution,
        ),
      );

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
