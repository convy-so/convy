import { voyage } from "@ai-sdk/voyage";
import { generateText, Output, rerank as aiRerank } from "ai";
import { z } from "zod";

import { SearchResult } from "./search";
import { logUsage, type UsageLogInput } from "../billing/logger";
import { flashLiteModel } from "../ai";
import { env } from "@/lib/env";
import {
  buildRerankerFallbackSystemPrompt,
  buildRerankerFallbackUserPrompt,
} from "./prompts/reranker";
import * as Sentry from "@sentry/nextjs";
import { createLogger, serializeError } from "@/lib/logger";

const voyageRerankingModel = voyage.reranking("rerank-2.5-lite");

function getVoyageRerankTokenUsage(responseBody: unknown): number | null {
  if (!responseBody || typeof responseBody !== "object") return null;
  const usage = (responseBody as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return null;
  const totalTokens = (usage as { total_tokens?: unknown }).total_tokens;
  return typeof totalTokens === "number" ? totalTokens : null;
}

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

  const apiKey = env.VOYAGE_API_KEY;
  const instruction = getInstructionForFeature(attribution?.feature);
  // Voyage rerank-2.5-lite supports prepended instructions
  const queryWithInstruction = `Instruction: ${instruction}\nQuery: ${query}`;

  if (apiKey) {
    try {
      const documents = candidates.map((c) => c.content);

      const response = await aiRerank({
        model: voyageRerankingModel,
        query: queryWithInstruction,
        documents,
        topN: topK,
        providerOptions: {
          voyage: {
            truncation: false,
          },
        },
      });

      const totalTokens = getVoyageRerankTokenUsage(response.response.body);
      if (totalTokens) {
        logUsage({
          ...attribution,
          type: "llm_text",
          provider: "voyage",
          modelName: "rerank-2.5-lite",
          promptTokens: totalTokens,
          completionTokens: 0,
          totalTokens,
        });
      }

      const rankedResults: SearchResult[] = [];
      const seenIndices = new Set<number>();

      // response.data contains the ranked results
      const results = response.ranking ?? [];
      for (const item of results) {
        const index = item.originalIndex;
        if (index !== undefined && index >= 0 && index < candidates.length) {
          rankedResults.push({
            ...candidates[index],
            score: item.score ?? candidates[index].score,
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
      createLogger("reranker").warn("Voyage API failed, falling back to Gemini", serializeError(error));
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
      system: buildRerankerFallbackSystemPrompt(instruction),
      prompt: buildRerankerFallbackUserPrompt({
        query,
        candidates,
        topK,
      }),
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
    createLogger("reranker").error("Gemini fallback failed", serializeError(error));
    Sentry.captureException(error, { tags: { service: "reranker" } });
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
