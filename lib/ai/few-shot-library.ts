import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { fewShotExamples } from "@/db/schema/ai";
import {
  generateEmbedding,
} from "@/lib/rag/embeddings";
import { rerank } from "@/lib/rag/reranker";
import type { SearchResult } from "@/lib/rag/search";
import type { PromptExample } from "@/lib/ai-core/types";

/** Runtime guard — mirrors normalizeMetadata in lib/rag/search.ts */
function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(Object.entries(value));
}

type GetDynamicExamplesOptions = {
  feature: string;
  limit?: number;
  /**
   * Natural-language context string (e.g. "student struggling with quadratic
   * equations in math class"). This is embedded and used for semantic recall.
   * If empty the function falls back to BM25-only retrieval on the feature name.
   */
  context?: string;
  /** Optional BCP-47 language code for the full-text search config. */
  locale?: string;
};

const LANG_CONFIG: Record<string, string> = {
  en: "english",
  de: "german",
  fr: "french",
};

/**
 * Builds a structured retrieval header that captures all the searchable
 * metadata for an example so that BM25 can surface it on keywords alone.
 */
export function buildFewShotRetrievalContent(params: {
  feature: string;
  tags: string[];
  content: Record<string, unknown>;
}): string {
  const tagLine = params.tags.length > 0 ? `Tags: ${params.tags.join(", ")}` : "";
  const contentText = JSON.stringify(params.content, null, 0);
  return [`Feature: ${params.feature}`, tagLine, contentText]
    .filter(Boolean)
    .join("\n");
}

/**
 * Production-grade few-shot example retrieval.
 *
 * Pipeline:
 *   1. Embed the context string with text-embedding-3-small (if provided).
 *   2. Run HNSW vector search + BM25 full-text search in parallel (over-fetch).
 *   3. Fuse both result sets with Reciprocal Rank Fusion (RRF, k=60).
 *   4. Re-rank the fused candidate pool with Voyage rerank-2 (LLM fallback).
 *   5. Hydrate and return up to `limit` examples in reranker order.
 *
 * Designed for failure: any exception returns [] so the AI path never crashes.
 */
export async function getDynamicFewShotExamples({
  feature,
  limit = 3,
  context = "",
  locale = "en",
}: GetDynamicExamplesOptions): Promise<PromptExample[]> {
  try {
    const db = getDb();
    const tsConfig = LANG_CONFIG[locale] ?? "english";
    const featureFilter = and(
      eq(fewShotExamples.feature, feature),
      eq(fewShotExamples.isActive, true),
    );

    // ─── Phase 1: Vector recall via HNSW ────────────────────────────────────
    let vectorResults: SearchResult[] = [];
    if (context.trim()) {
      const queryVector = JSON.stringify(await generateEmbedding(context, { feature }));
      const rows = await db
        .select({
          id: fewShotExamples.id,
          content: fewShotExamples.retrievalContent,
          metadata: fewShotExamples.metadata,
          score: sql<number>`1 - (${fewShotExamples.embedding} <=> ${queryVector})`,
        })
        .from(fewShotExamples)
        .where(and(featureFilter, sql`${fewShotExamples.embedding} IS NOT NULL`))
        .orderBy(sql`${fewShotExamples.embedding} <=> ${queryVector} ASC`)
        .limit(limit * 8); // over-fetch for RRF

      vectorResults = rows.map((r) => ({
        id: r.id,
        content: r.content,
        score: r.score,
      metadata: normalizeMetadata(r.metadata),
        sourceType: "few_shot_example",
        createdAt: new Date(),
      }));
    }

    // ─── Phase 2: BM25 full-text recall via GIN ─────────────────────────────
    const searchText = context.trim() || feature;
    const tsQuery = sql`websearch_to_tsquery(${tsConfig}, ${searchText})`;
    const bm25Rows = await db
      .select({
        id: fewShotExamples.id,
        content: fewShotExamples.retrievalContent,
        metadata: fewShotExamples.metadata,
        score: sql<number>`ts_rank(
          to_tsvector(${tsConfig}, ${fewShotExamples.retrievalContent}),
          ${tsQuery}
        )`,
      })
      .from(fewShotExamples)
      .where(
        and(
          featureFilter,
          sql`to_tsvector(${tsConfig}, ${fewShotExamples.retrievalContent}) @@ ${tsQuery}`,
        ),
      )
      .orderBy(
        sql`ts_rank(
          to_tsvector(${tsConfig}, ${fewShotExamples.retrievalContent}),
          ${tsQuery}
        ) DESC`,
      )
      .limit(limit * 8);

    const textResults: SearchResult[] = bm25Rows.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.score,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      sourceType: "few_shot_example",
      createdAt: new Date(),
    }));

    // ─── Phase 3: RRF fusion (k=60) ─────────────────────────────────────────
    const k = 60;
    const rrfScores = new Map<string, number>();
    const candidateMap = new Map<string, SearchResult>();

    vectorResults.forEach((result, i) => {
      rrfScores.set(result.id, (rrfScores.get(result.id) ?? 0) + 1 / (k + i + 1));
      candidateMap.set(result.id, result);
    });
    textResults.forEach((result, i) => {
      rrfScores.set(result.id, (rrfScores.get(result.id) ?? 0) + 1 / (k + i + 1));
      if (!candidateMap.has(result.id)) candidateMap.set(result.id, result);
    });

    const candidatePool = Array.from(rrfScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit * 10)
      .map(([id, score]) => ({ ...candidateMap.get(id)!, score }));

    if (candidatePool.length === 0) return [];

    // ─── Phase 4: Voyage rerank-2 (LLM fallback built into reranker) ────────
    const reranked = await rerank(searchText, candidatePool, limit);
    const finalIds = reranked.map((r) => r.id);

    // ─── Phase 5: Hydrate full content from DB in reranker order ────────────
    const hydrated = await db.query.fewShotExamples.findMany({
      where: and(
        featureFilter,
        sql`${fewShotExamples.id} = ANY(ARRAY[${sql.raw(
          finalIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(","),
        )}])`,
      ),
    });

    const hydratedMap = new Map(hydrated.map((h) => [h.id, h]));
    return finalIds
      .map((id) => hydratedMap.get(id)?.content as PromptExample | undefined)
      .filter((c): c is PromptExample => c !== undefined);
  } catch (error) {
    // Designed for failure: silently log and return [] to keep AI path alive
    console.error(`[few-shot-library] Retrieval failed for feature=${feature}`, error);
    return [];
  }
}

/**
 * Indexes a few-shot example by generating its embedding and structured
 * retrieval content. Call this immediately after insert or update so the
 * HNSW and GIN indexes stay current.
 */
export async function indexFewShotExample(params: {
  id: string;
  feature: string;
  tags: string[];
  content: Record<string, unknown>;
}) {
  const retrievalContent = buildFewShotRetrievalContent(params);
  const embedding = await generateEmbedding(retrievalContent, { feature: params.feature });

  await getDb()
    .update(fewShotExamples)
    .set({ retrievalContent, embedding, updatedAt: new Date() })
    .where(eq(fewShotExamples.id, params.id));
}
