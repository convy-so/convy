import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { getEncoding } from "js-tiktoken";

/**
 * OpenAI text-embedding-3-small
 *  - 1536 dimensions by default
 *  - Token limit: 8,191 tokens per request
 *  - Encoding: cl100k_base
 *  - Excellent multilingual support for EN, FR, DE, IT, ES
 */
const embeddingModel = openai.embedding("text-embedding-3-small");

const enc = getEncoding("cl100k_base");

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
  });
  return embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: texts,
  });
  return embeddings;
}

export interface ChunkOptions {
  maxTokens?: number; // Max tokens per chunk (default: 512, well within 8191 limit)
  overlap?: number; // Overlap in tokens (default: 50)
}

/**
 * Splits text into overlapping token-based chunks using js-tiktoken.
 *
 * This is the correct approach for multi-lingual content (EN, FR, DE, IT, ES),
 * where character counts differ significantly from token counts. Using tokens
 * ensures we never approach the 8,191-token model limit and produce semantically
 * consistent chunk sizes across all supported languages.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { maxTokens = 512, overlap = 50 } = options;

  if (!text.trim()) return [];

  // Encode the entire text into tokens
  const tokens = enc.encode(text);

  // If the text is short enough to fit in a single chunk, return it as-is
  if (tokens.length <= maxTokens) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < tokens.length) {
    const end = Math.min(start + maxTokens, tokens.length);

    // Decode the token slice back to text
    const chunkTokens = tokens.slice(start, end);
    const chunk = new TextDecoder()
      .decode(Buffer.from(enc.decode(chunkTokens)))
      .trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // If we've reached the end, stop
    if (end >= tokens.length) break;

    // Advance by (maxTokens - overlap) to create overlapping window
    start = end - overlap;
  }

  return chunks;
}
