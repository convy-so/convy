import {
  convertToModelMessages,
  generateText,
  Output,
  streamText,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { logUsage, type UsageLogInput } from "@/lib/billing/logger";
import { tutorAnalysisModel, tutorChatModel } from "@/lib/ai/models";
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

    return result.output;
  } catch (err) {
    log.error("Structured output generation failed", serializeError(err));
    Sentry.captureException(err, { tags: { service: "ai-runtime" } });
    throw err;
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
