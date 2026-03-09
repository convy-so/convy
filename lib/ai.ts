import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import {
  generateText,
  streamText,
  type ModelMessage,
  type LanguageModel,
  convertToModelMessages,
} from "ai";
import { RollingContext } from "./conversation-memory";
import { logUsage } from "./billing/logger";

export async function normalizeMessages(
  messages: any[],
): Promise<ModelMessage[]> {
  console.log(
    `[AI:normalizeMessages] Normalizing ${messages.length} messages...`,
  );
  const result = await convertToModelMessages(messages);
  console.log(`[AI:normalizeMessages] Done. Result count: ${result.length}`);
  return result;
}

export const GEMINI_FLASH_LITE_ID = "gemini-2.5-flash-lite";
export const GEMINI_FLASH_ID = "gemini-2.5-flash";
export const GEMINI_FLASH_STABLE_ID = "gemini-2.0-flash";
export const GPT_4_1_MINI_ID = "gpt-4.1-mini";

export const flashLiteModel = google(GEMINI_FLASH_LITE_ID);
export const flashModel = google(GEMINI_FLASH_ID);
// Stable production model with high quota — used for background extraction
export const flashStableModel = google(GEMINI_FLASH_STABLE_ID);
export const gpt41MiniModel = openai(GPT_4_1_MINI_ID);

// Use stable flash for analysis (high-volume background calls)
export const analysisModel = flashStableModel;

export const defaultModel = gpt41MiniModel;

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
  },
) {
  const model = options?.model ?? defaultModel;

  const result = await generateText({
    model,
    prompt,
    system: systemPrompt,
    temperature: options?.temperature ?? 0.7,
    maxOutputTokens: options?.maxTokens ?? 2000,
  });

  logUsage({
    userId: options?.userId,
    organizationId: options?.organizationId,
    surveyId: options?.surveyId,
    type: "llm_text",
    provider: (model as any).modelId?.includes("gpt") ? "openai" : "google",
    modelName: (model as any).modelId ?? GEMINI_FLASH_ID,
    promptTokens:
      result.usage.inputTokens ?? (result.usage as any).promptTokens,
    completionTokens:
      result.usage.outputTokens ?? (result.usage as any).completionTokens,
    totalTokens: result.usage.totalTokens,
  });

  return result.text;
}

/**
 * Stream text for real-time conversations
 */
export function streamAIResponse(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string,
  options?: {
    model?: LanguageModel;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
    organizationId?: string;
    surveyId?: string;
  },
) {
  const model = options?.model ?? defaultModel;

  return streamText({
    model,
    messages,
    system: systemPrompt,
    temperature: options?.temperature ?? 0.7,
    maxOutputTokens: options?.maxTokens ?? 2000,
    onFinish: (result) => {
      logUsage({
        userId: options?.userId,
        organizationId: options?.organizationId,
        surveyId: options?.surveyId,
        type: "llm_text",
        provider: (model as any).modelId?.includes("gpt") ? "openai" : "google",
        modelName: (model as any).modelId ?? GEMINI_FLASH_ID,
        promptTokens:
          result.usage.inputTokens ?? (result.usage as any).promptTokens,
        completionTokens:
          result.usage.outputTokens ?? (result.usage as any).completionTokens,
        totalTokens: result.usage.totalTokens,
      });
    },
  });
}

export { google };
