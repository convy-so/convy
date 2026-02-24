import { google } from "@ai-sdk/google";
import { generateText, streamText, type ModelMessage } from "ai";
import type { RollingContext } from "./conversation-memory";
import { logUsage } from "./billing/logger";

/**
 * Normalizes messages from the client (which may use UI-centric 'parts')
 * into the ModelMessage format expected by the Vercel AI SDK.
 */
export function normalizeMessages(messages: any[]): ModelMessage[] {
  return messages.map((msg) => {
    const { role, content, parts } = msg;

    // If content is already a string and present, use it
    if (typeof content === "string" && content.length > 0) {
      return { role, content } as ModelMessage;
    }

    // If content is missing or empty, but parts are present, extract text content
    if (Array.isArray(parts)) {
      const textContent = parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n");

      return { role, content: textContent } as ModelMessage;
    }

    // Fallback for assistant messages with tool calls but no text
    if (role === "assistant" && Array.isArray(content)) {
      return { role, content } as ModelMessage;
    }

    // Absolute fallback
    return { role, content: content || "" } as ModelMessage;
  });
}

export const flashLiteModel = google("gemini-2.5-flash-lite");
export const flashModel = google("gemini-2.5-flash");

// Use flash for analysis to ensure tool calling reliability
export const analysisModel = flashModel;

/**
 * Determine which model to use based on conversation state
 *
 * Strategy: Always use Flash model for all surveys.
 * This ensures reliable tool calling (showMedia, finishSurvey) throughout.
 *
 * @param context Rolling context with progress and state information
 * @param userMessageCount Number of user messages in the conversation
 * @param minQuestions Minimum number of questions required
 * @param hasMedia Whether the survey has media that may need to be displayed
 * @returns The appropriate Gemini model to use
 */
export function selectModelForConversation(
  context: RollingContext | undefined,
  userMessageCount: number,
  minQuestions: number,
  hasMedia: boolean = false,
): ReturnType<typeof google> {
  // Always use Flash for reliable tool calling and consistent behavior
  return flashModel;
}

/**
 * Get the default model (flash for reliable tool calling)
 */
export const defaultModel = flashModel;

/**
 * Generate text using AI (for non-streaming tasks like summaries, insights)
 */
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

  // Log usage
  logUsage({
    userId: options?.userId,
    organizationId: options?.organizationId,
    surveyId: options?.surveyId,
    type: "llm_text",
    provider: "google",
    modelName: model.modelId,
    promptTokens: result.usage.inputTokens,
    completionTokens: result.usage.outputTokens,
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
        modelName: model.modelId,
        promptTokens: result.usage.inputTokens,
        completionTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      });
    },
  });
}

export { google };
