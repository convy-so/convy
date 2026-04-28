import { voyage } from "@ai-sdk/voyage";
import { embed, embedMany } from "ai";
import { logUsage, type UsageLogInput } from "../billing/logger";

const embeddingModel = voyage.embedding("voyage-4");

export const STANDARD_MODEL = "voyage-4";
export const EMBEDDING_DIMENSIONS = 1024;

export const EMBEDDING_VERSION = "voyage:v4@1024";
export const DEFAULT_CHUNKING_VERSION = "char-voyage-15p-buffer:v3";

export interface ChunkOptions {
  maxTokens?: number;
}

/**
 * Character-based token estimation for Voyage AI.
 */
export function countTokens(text: string): number {
  if (!text.trim()) return 0;
  return Math.ceil((text.length / 5) * 1.15);
}

/**
 * Splits text into non-overlapping chunks.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { maxTokens = 400 } = options;
  if (!text.trim()) return [];

  const targetChars = Math.floor(maxTokens * 0.85 * 5);
  if (text.length <= targetChars) return [text.trim()];

  const chunks: string[] = [];
  let currentStart = 0;

  while (currentStart < text.length) {
    let currentEnd = currentStart + targetChars;
    if (currentEnd < text.length) {
      const boundary = text.lastIndexOf(" ", currentEnd);
      if (boundary > currentStart && currentEnd - boundary < 100) {
        currentEnd = boundary;
      }
    }
    const chunk = text.slice(currentStart, currentEnd).trim();
    if (chunk) chunks.push(chunk);
    currentStart = currentEnd + 1;
  }

  return chunks;
}

/**
 * Standard embedding for single queries or atomic items.
 *
 * Uses the Vercel AI SDK with voyage-4.
 */
export async function generateEmbedding(
  text: string,
  attribution?: Partial<UsageLogInput>,
): Promise<number[]> {
  if (!text.trim()) {
    return new Array(EMBEDDING_DIMENSIONS).fill(0);
  }

  const { embedding, usage } = await embed({
    model: embeddingModel,
    value: text,
  });

  if (usage?.tokens) {
    logUsage({
      ...attribution,
      type: "llm_embedding",
      provider: "voyage",
      modelName: STANDARD_MODEL,
      totalTokens: usage.tokens,
    });
  }

  return embedding;
}

/**
 * Batch embeddings using voyage-4 and the Vercel AI SDK.
 * Efficiently embeds multiple independent strings in one call.
 */
export async function generateBatchEmbeddings(
  texts: string[],
  attribution?: Partial<UsageLogInput>,
): Promise<number[][]> {
  if (texts.length === 0 || texts.every((t) => !t.trim())) {
    return texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0));
  }

  const { embeddings, usage } = await embedMany({
    model: embeddingModel,
    values: texts,
  });

  if (usage?.tokens) {
    logUsage({
      ...attribution,
      type: "llm_embedding",
      provider: "voyage",
      modelName: STANDARD_MODEL,
      totalTokens: usage.tokens,
    });
  }

  return embeddings;
}
