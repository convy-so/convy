import { getDb } from "@/db";
import { usageLogs } from "@/db/schema/billing";
import { nanoid } from "nanoid";

export type UsageLogInput = {
  userId?: string;
  folderId?: string;
  surveyId?: string;
  feature?: string;
  type:
    | "llm_text"
    | "llm_embedding"
    | "stt"
    | "tts"
    | "search"
    | "voice_session"
    | "agent_loop";
  provider: string;
  modelName?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputNoCacheTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  durationMs?: number;
};

// Rough pricing per 1M tokens or per minute/query
const PRICING: Record<string, { prompt: number; completion: number }> = {
  "gemini-2.5-flash": { prompt: 0.1, completion: 0.4 },
  "gemini-2.5-flash-lite": { prompt: 0.075, completion: 0.3 },
  "gpt-4o": { prompt: 5.0, completion: 15.0 },
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "gpt-4.1-mini": { prompt: 0.4, completion: 1.6 },
};

export function calculateCost(input: UsageLogInput): string {
  if (input.type === "llm_text" && input.modelName) {
    const pricing = PRICING[input.modelName] || PRICING["gemini-2.5-flash"];
    const promptCost = (input.promptTokens || 0) * (pricing.prompt / 1_000_000);
    const completionCost =
      (input.completionTokens || 0) * (pricing.completion / 1_000_000);
    return (promptCost + completionCost).toFixed(6);
  }

  if (input.type === "stt") {
    // Deepgram Nova-2: ~$0.0043/min
    const minutes = (input.durationMs || 0) / 60000;
    return (minutes * 0.0043).toFixed(6);
  }

  if (input.type === "tts") {
    // Deepgram Aura: ~$0.015 / 1000 characters (rough approx as duration)
    // Assuming 150 words per minute, 5 characters per word = 750 chars/min
    const minutes = (input.durationMs || 0) / 60000;
    const estimatedChars = minutes * 750;
    return ((estimatedChars / 1000) * 0.015).toFixed(6);
  }

  if (input.type === "voice_session") {
    // Bundle cost for STT + LLM + TTS (Deepgram Voice Agent)
    // Est: $0.10 per minute of "active" conversation
    const minutes = (input.durationMs || 0) / 60000;
    return (minutes * 0.1).toFixed(6);
  }

  if (input.type === "search") {
    // e.g. Tavily search: ~$0.01 per search
    return "0.010000";
  }

  if (input.type === "llm_embedding") {
    // OpenAI text-embedding-3-small: $0.00002 / 1k tokens
    const tokens = input.totalTokens || 0;
    return (tokens * (0.00002 / 1000)).toFixed(6);
  }

  return "0";
}

export function estimateUsageCost(input: UsageLogInput) {
  return Number(calculateCost(input));
}

/**
 * Log a software usage event to the database.
 */
export async function logUsage(input: UsageLogInput) {
  try {
    const cost = calculateCost(input);

    await getDb().insert(usageLogs).values({
      id: nanoid(),
      ...input,
      cost,
    });
  } catch {
    // Don't let billing errors crash the main app flow, just log them
  }
}


