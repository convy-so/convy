import { VoyageAIClient } from "voyageai";
import { generateText, Output } from "ai";
import { z } from "zod";

import { SearchResult } from "./search";
import { logUsage, type UsageLogInput } from "../billing/logger";
import { flashLiteModel } from "../ai";

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });

function getInstructionForFeature(feature?: string): string {
  if (!feature) {
    return "Prioritize documents that are structurally and semantically relevant to the user query.";
  }

  if (feature.includes("survey") || feature.includes("rag-query")) {
    return "Prioritize documents that provide strong insight into respondent sentiment, qualitative analysis, and direct structural relevance to the survey query.";
  }

  if (feature.includes("learning-topic") || feature.includes("learning-material")) {
    return "Prioritize educational materials that directly explain the queried concepts, focusing on structural relevance, conceptual clarity, and pedagogical utility.";
  }

  if (feature.includes("evidence")) {
    return "Prioritize student progress reports, interactions, and assessment patterns that provide clear evidence of student understanding, struggle markers, and mastery progression.";
  }

  if (feature.includes("few-shot") || feature.includes("few_shot")) {
    return "Prioritize exact prompt examples and system prompt templates that structurally match the requested scenario for few-shot in-context learning.";
  }

  return "Prioritize documents that are structurally and semantically relevant to the user query.";
}

export async function rerank(
  query: string,
  candidates: SearchResult[],
  topK: number = 5,
  attribution?: Partial<UsageLogInput>,
): Promise<SearchResult[]> {
  if (candidates.length === 0) return [];

  const apiKey = process.env.VOYAGE_API_KEY;
  const instruction = getInstructionForFeature(attribution?.feature);
  // Voyage rerank-2.5-lite supports prepended instructions
  const queryWithInstruction = `Instruction: ${instruction}\nQuery: ${query}`;

  if (apiKey) {
    try {
      const documents = candidates.map((c) => c.content);

      const response = await voyage.rerank({
        query: queryWithInstruction,
        documents,
        model: "rerank-2.5-lite",
        topK,
        truncation: false,
      });

      if (response.usage?.totalTokens) {
        logUsage({
          ...attribution,
          type: "llm_text",
          provider: "voyage",
          modelName: "rerank-2.5-lite",
          promptTokens: response.usage.totalTokens,
          completionTokens: 0,
          totalTokens: response.usage.totalTokens,
        });
      }

      const rankedResults: SearchResult[] = [];
      const seenIndices = new Set<number>();

      // response.data contains the ranked results
      const results = response.data ?? [];
      for (const item of results) {
        const index = item.index;
        if (index !== undefined && index >= 0 && index < candidates.length) {
          rankedResults.push({
            ...candidates[index],
            score: item.relevanceScore ?? candidates[index].score,
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
    } catch (error) {
      console.error("[reranker] Voyage API failed, falling back to Gemini", error);
    }
  }

  // Fallback to Gemini 2.5 Flash Lite
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
      system: `You are an expert search quality rater. Your task is to rank the following search results based on their relevance to the user's query.
Instruction: ${instruction}
Return the indices of the most relevant results, ordered from most relevant to least relevant.
Ignore results that are irrelevant to the query.`,
      prompt: `Query: "${query}"

Results:
${candidates.map((c, i) => `[${i}] ${c.content.substring(0, 300)}...`).join("\n")}

Rank the top ${topK} results.`,
    });

    if (usage) {
      logUsage({
        ...attribution,
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
  } catch (error) {
    console.error("[reranker] Gemini fallback failed", error);
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
    score: r.score,
  }));
}
