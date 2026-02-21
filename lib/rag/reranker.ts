import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { SearchResult } from "./search";

const rerankModel = google("gemini-1.5-flash-8b");

export async function rerank(
  query: string,
  candidates: SearchResult[],
  topK: number = 5,
): Promise<SearchResult[]> {
  if (candidates.length === 0) return [];

  try {
    const { output } = await generateText({
      model: rerankModel,
      output: Output.object({
        schema: z.object({
          rankedIndices: z
            .array(z.number())
            .describe(
              "Indices of the candidates in order of relevance (0-based)",
            ),
        }),
      }),
      system: `You are a search quality rater. Your task is to rank the following search results based on their relevance to the user's query.
Return the indices of the most relevant results, ordered from most relevant to least relevant.
Ignore results that are irrelevant to the query.`,
      prompt: `Query: "${query}"

Results:
${candidates.map((c, i) => `[${i}] ${c.content.substring(0, 300)}...`).join("\n")}

Rank the top ${topK} results.`,
    });

    const rankedResults: SearchResult[] = [];
    const seenIndices = new Set<number>();

    for (const index of output.rankedIndices) {
      if (index >= 0 && index < candidates.length && !seenIndices.has(index)) {
        rankedResults.push(candidates[index]);
        seenIndices.add(index);
      }
      if (rankedResults.length >= topK) break;
    }

    // If we have fewer than topK, fill with original order (excluding already picked)
    if (rankedResults.length < topK) {
      for (let i = 0; i < candidates.length; i++) {
        if (!seenIndices.has(i)) {
          rankedResults.push(candidates[i]);
          if (rankedResults.length >= topK) break;
        }
      }
    }

    return rankedResults;
  } catch (error) {
    console.error("Reranking failed:", error);
    // Fallback: return original top K
    return candidates.slice(0, topK);
  }
}

/**
 * Specialized reranker for text snippets.
 * Used by agents to refine context before including it in prompts.
 */
export async function rerankResults(
  query: string,
  items: string[],
  topK: number = 5,
): Promise<{ item: string; score?: number }[]> {
  if (items.length === 0) return [];

  // Convert strings to a format compatible with the internal rerank logic if needed,
  // or just implement a simpler version here.
  // For consistency, let's use the core rerank logic by wrapping.

  const tempCandidates: SearchResult[] = items.map((content, i) => ({
    id: `temp-${i}`,
    content,
    score: 0,
    metadata: {},
    sourceType: "temp",
    createdAt: new Date(),
  }));

  const ranked = await rerank(query, tempCandidates, topK);

  return ranked.map((r) => ({
    item: r.content,
  }));
}
