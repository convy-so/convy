import { SearchResult } from "./search";
import { logUsage } from "../billing/logger";
import { generateText, Output } from "ai";
import { flashLiteModel } from "../ai";
import { z } from "zod";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/rerank";

export async function rerank(
  query: string,
  candidates: SearchResult[],
  topK: number = 5,
  metadata?: {
    userId?: string;
    surveyId?: string;
  },
): Promise<SearchResult[]> {
  if (candidates.length === 0) return [];

  // Protect against edge cases where the key is missing
  const apiKey = process.env.VOYAGE_API_KEY;
  if (apiKey) {
    try {
      const documents = candidates.map((c) => c.content);

      const response = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          documents,
          model: "rerank-2",
          top_k: topK,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voyage API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Log the usage
      if (data.usage?.total_tokens) {
        logUsage({
          userId: metadata?.userId,
          surveyId: metadata?.surveyId,
          type: "llm_text",
          provider: "voyage",
          modelName: "rerank-2",
          promptTokens: data.usage.total_tokens, // Voyage bills primarily on total tokens for reranking
          completionTokens: 0,
          totalTokens: data.usage.total_tokens,
        });
      }

      const rankedResults: SearchResult[] = [];
      const seenIndices = new Set<number>();

      // Voyage returns data array sorted by relevance_score
      for (const item of data.data) {
        const index = item.index;
        if (index >= 0 && index < candidates.length) {
          rankedResults.push({
            ...candidates[index],
            score: item.relevance_score ?? candidates[index].score // Update the score with the new rerank score if available
          });
          seenIndices.add(index);
        }
      }

      // Fallback fill just in case
      if (rankedResults.length < topK) {
        for (let i = 0; i < candidates.length; i++) {
          if (!seenIndices.has(i)) {
            rankedResults.push(candidates[i]);
            if (rankedResults.length >= topK) break;
          }
        }
      }

      return rankedResults;
    } catch {
    }
  } else {
  }

  try {
    const { output: object, usage } = await generateText({
      model: flashLiteModel,
      output: Output.object({
        schema: z.object({
          rankedIndices: z
            .array(z.number())
            .describe("Indices of the candidates in order of relevance (0-based)"),
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

    if (usage) {
      logUsage({
        userId: metadata?.userId,
        surveyId: metadata?.surveyId,
        type: "llm_text",
        provider: "google",
        modelName: "gemini-2.5-flash-lite",
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      });
    }

    const rankedResults: SearchResult[] = [];
    const seenIndices = new Set<number>();

    for (const index of object.rankedIndices) {
      if (index >= 0 && index < candidates.length && !seenIndices.has(index)) {
        rankedResults.push(candidates[index]);
        seenIndices.add(index);
      }
      if (rankedResults.length >= topK) break;
    }

    if (rankedResults.length < topK) {
      for (let i = 0; i < candidates.length; i++) {
        if (!seenIndices.has(i)) {
          rankedResults.push(candidates[i]);
          if (rankedResults.length >= topK) break;
        }
      }
    }

    return rankedResults;
  } catch {
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
    score: r.score
  }));
}

