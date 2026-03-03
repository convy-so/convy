import { google } from "@ai-sdk/google";
import {
  generateText,
  streamText,
  type ModelMessage,
  convertToModelMessages,
} from "ai";
import { RollingContext } from "./conversation-memory";
import { logUsage } from "./billing/logger";

export async function normalizeMessages(
  messages: any[],
): Promise<ModelMessage[]> {
  return await convertToModelMessages(messages);
}

export const GEMINI_FLASH_LITE_ID = "gemini-2.5-flash-lite";
export const GEMINI_FLASH_ID = "gemini-2.5-flash";

export const flashLiteModel = google(GEMINI_FLASH_LITE_ID);
export const flashModel = google(GEMINI_FLASH_ID);

// Use flash-lite for analysis (cost-efficient, high-volume)
export const analysisModel = flashLiteModel;

export function selectModelForConversation(
  context: RollingContext,
  userMessageCount: number,
  minQuestions: number,
  hasMedia: boolean,
): ReturnType<typeof google> {
  // Use Flash (stronger) for media-heavy or long conversations
  if (hasMedia || userMessageCount > 12) {
    return flashModel;
  }

  // Use Flash (stronger) for complex drilling states
  if (
    context.stateContext.currentState === "DRILLING_DEEPER" ||
    context.stateContext.currentState === "CHECKING_COVERAGE"
  ) {
    return flashModel;
  }

  // Use Flash Lite (faster/cheaper) for early greeting or simple coverage
  return flashLiteModel;
}

export const defaultModel = flashLiteModel;

export async function generateAIResponse(
  prompt: string,
  systemPrompt?: string,
  options?: {
    model?: ReturnType<typeof google>;
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
    provider: "google",
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
    model?: ReturnType<typeof google>;
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
        provider: "google",
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
