import {
  convertToModelMessages,
  generateText,
  Output,
  streamText,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { calculateCost, logUsage, type UsageLogInput } from "@/lib/billing/logger";
import type { AiContextLayer } from "@/lib/ai/context-assembler";
import {
  createAiRunTrace,
  finishAiRunTrace,
  recordAiContextLayers,
  type AiRunTraceInput,
} from "@/lib/ai/observability";
import { tutorAnalysisModel, tutorChatModel } from "@/lib/ai/models";

type StructuredGenerationParams<TSchema extends z.ZodTypeAny> = {
  schema: TSchema;
  prompt: string;
  system?: string;
  model?: LanguageModel;
  temperature?: number;
  maxOutputTokens?: number;
  observability?: AiRunTraceInput & { contextLayers?: AiContextLayer[] };
};

type StreamUiTextParams = {
  messages: UIMessage[];
  system: string;
  model?: LanguageModel;
  temperature?: number;
  maxOutputTokens?: number;
};

export async function generateStructuredOutput<TSchema extends z.ZodTypeAny>(
  params: StructuredGenerationParams<TSchema>,
): Promise<z.infer<TSchema>> {
  const model = params.model ?? tutorAnalysisModel;
  const startedAt = Date.now();
  const runId = params.observability
    ? await createAiRunTrace({
        ...params.observability,
        status: "running",
        modelProvider:
          params.observability.modelProvider ?? getProviderName(model),
        modelName: params.observability.modelName ?? getModelId(model),
        temperature: params.observability.temperature ?? params.temperature ?? 0.2,
        maxTokens:
          params.observability.maxTokens ?? params.maxOutputTokens ?? 1500,
        metadata: {
          ...(params.observability.metadata ?? {}),
          promptPreview:
            params.prompt.length > 400
              ? `${params.prompt.slice(0, 397)}...`
              : params.prompt,
        },
      })
    : null;

  if (runId && params.observability?.contextLayers?.length) {
    await recordAiContextLayers(runId, params.observability.contextLayers);
  }

  try {
    const result = await generateText({
      model,
      system: params.system,
      prompt: params.prompt,
      temperature: params.temperature ?? 0.2,
      maxOutputTokens: params.maxOutputTokens ?? 1500,
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

    if (runId) {
      await finishAiRunTrace(runId, {
        status: "completed",
        outputText: JSON.stringify(result.output),
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

    return result.output;
  } catch (error) {
    if (runId) {
      await finishAiRunTrace(runId, {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Structured generation failed",
        latencyMs: Date.now() - startedAt,
      });
    }
    throw error;
  }
}

export async function streamUiText(params: StreamUiTextParams) {
  const messages = await convertToModelMessages(params.messages);
  return streamText({
    model: params.model ?? tutorChatModel,
    system: params.system,
    messages,
    temperature: params.temperature ?? 0.3,
    maxOutputTokens: params.maxOutputTokens ?? 900,
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
