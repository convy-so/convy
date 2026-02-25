import { google } from "@ai-sdk/google";
import { generateText, streamText, type ModelMessage } from "ai";
import type { RollingContext } from "./conversation-memory";
import { logUsage } from "./billing/logger";

/**
 * Normalizes messages from the client (which may use UI-centric 'parts')
 * into the ModelMessage format expected by the Vercel AI SDK.
 *
 * IMPORTANT: Must preserve tool call and tool result parts so the AI
 * receives the complete conversation history including resolved tool calls.
 * Without this, the AI will re-invoke tools it has already called.
 */
export function normalizeMessages(messages: any[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const msg of messages) {
    const { role, content, parts } = msg;

    // --- Assistant messages ---
    if (role === "assistant") {
      // If content is already a proper array (multi-part: text + tool-call), use as-is
      if (Array.isArray(content)) {
        result.push({ role, content } as ModelMessage);
        continue;
      }

      // Build assistant content from parts (AI SDK v6 format)
      if (Array.isArray(parts) && parts.length > 0) {
        const contentParts: any[] = [];

        for (const p of parts) {
          if (p.type === "text" && p.text) {
            contentParts.push({ type: "text", text: p.text });
          } else if (p.type?.startsWith("tool-") && p.toolCallId) {
            // This is a tool-call part: type = 'tool-{toolName}'
            const toolName = p.type.replace(/^tool-/, "");
            if (p.state === "output-available" || p.output !== undefined) {
              // Skip — tool results are represented as separate 'tool' role messages below
            } else {
              // Tool call (pending/input-available)
              contentParts.push({
                type: "tool-call",
                toolCallId: p.toolCallId,
                toolName,
                args: p.input ?? p.args ?? {},
              });
            }
          }
        }

        if (contentParts.length > 0) {
          result.push({ role, content: contentParts } as ModelMessage);

          // After the assistant message, emit tool-result messages for resolved tools
          for (const p of parts) {
            if (
              p.type?.startsWith("tool-") &&
              p.toolCallId &&
              (p.state === "output-available" || p.output !== undefined)
            ) {
              const toolName = p.type.replace(/^tool-/, "");
              result.push({
                role: "tool",
                content: [
                  {
                    type: "tool-result",
                    toolCallId: p.toolCallId,
                    toolName,
                    result: p.output ?? p.result ?? {},
                  },
                ],
              } as ModelMessage);
            }
          }
          continue;
        }
      }

      // Plain string content
      const text = typeof content === "string" ? content : "";
      result.push({ role, content: text } as ModelMessage);
      continue;
    }

    // --- User messages ---
    if (role === "user") {
      if (typeof content === "string" && content.length > 0) {
        result.push({ role, content } as ModelMessage);
        continue;
      }
      if (Array.isArray(parts)) {
        const textContent = parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("\n");
        result.push({ role, content: textContent || "" } as ModelMessage);
        continue;
      }
      result.push({ role, content: content || "" } as ModelMessage);
      continue;
    }

    // Fallback for any other role
    result.push({ role, content: content || "" } as ModelMessage);
  }

  return result;
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
