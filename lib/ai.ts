import { google } from "@ai-sdk/google";
import { generateText, streamText} from "ai";
import type { RollingContext } from "./conversation-memory";


export const flashLiteModel = google("gemini-2.5-flash-lite");
export const flashModel = google("gemini-2.5-flash");

// Use flash-lite for analysis to keep costs low
export const analysisModel = flashLiteModel;

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
  hasMedia: boolean = false
): ReturnType<typeof google> {
  // Always use Flash for reliable tool calling and consistent behavior
  return flashModel;
}

/**
 * Get the default model (flash-lite for most use cases)
 */
export const defaultModel = flashLiteModel;

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
  }
) {
  const model = options?.model ?? defaultModel;

  const result = await generateText({
    model,
    prompt,
    system: systemPrompt,
    temperature: options?.temperature ?? 0.7,
    maxOutputTokens: options?.maxTokens ?? 2000,
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
  }
) {
  const model = options?.model ?? defaultModel;

  return streamText({
    model,
    messages,
    system: systemPrompt,
    temperature: options?.temperature ?? 0.7,
    maxOutputTokens: options?.maxTokens ?? 2000,
  });
}

export { google };
