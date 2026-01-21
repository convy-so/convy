import "server-only";

import { google } from "@ai-sdk/google";
import { generateText, streamText} from "ai";


export const defaultModel = google("gemini-2.5-flash-lite");
export const analysisModel = google("gemini-2.5-flash-lite");

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

