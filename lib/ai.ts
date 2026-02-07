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
 * Strategy: Use the cheaper flash-lite for most of the conversation,
 * but switch to the more reliable flash model when we're near completion
 * to ensure proper tool calling behavior.
 * 
 * @param context Rolling context with progress and state information
 * @param userMessageCount Number of user messages in the conversation
 * @param minQuestions Minimum number of questions required
 * @returns The appropriate Gemini model to use
 */
export function selectModelForConversation(
  context: RollingContext | undefined,
  userMessageCount: number,
  minQuestions: number
): ReturnType<typeof google> {
  // If no context available (e.g., greeting), use flash-lite
  if (!context) {
    return flashLiteModel;
  }

  // Primary signal: The context already calculates shouldWrapUp
  // which considers time, coverage, and conversation length
  if (context.progress.shouldWrapUp) {
    console.log(`[Model Selection] Switching to Flash: ${context.progress.wrapUpReason}`);
    return flashModel;
  }

  // Secondary signal: Check conversation state
  // WRAPPING_UP and CONCLUDING states indicate we're at the end
  if (
    context.stateContext.currentState === "WRAPPING_UP" ||
    context.stateContext.currentState === "CONCLUDING" ||
    context.stateContext.currentState === "CHECKING_COVERAGE"
  ) {
    console.log(`[Model Selection] Switching to Flash: State is ${context.stateContext.currentState}`);
    return flashModel;
  }

  // Tertiary signal: High completion percentage + sufficient messages
  // Even if shouldWrapUp isn't triggered, if we're 80%+ done with enough back-and-forth
  if (
    context.progress.completionPercentage >= 80 &&
    userMessageCount >= minQuestions
  ) {
    console.log(`[Model Selection] Switching to Flash: ${context.progress.completionPercentage}% complete with ${userMessageCount} messages`);
    return flashModel;
  }

  // Fallback: Emergency switch if conversation is very long
  // This prevents infinite conversations due to flash-lite not finishing
  if (userMessageCount >= minQuestions + 8) {
    console.log(`[Model Selection] Switching to Flash: Emergency switch at ${userMessageCount} messages`);
    return flashModel;
  }

  // Default: Use flash-lite for the bulk of the conversation
  return flashLiteModel;
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
