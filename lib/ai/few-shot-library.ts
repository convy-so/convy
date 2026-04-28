/**
 * lib/ai/few-shot-library.ts
 *
 * Manages the dynamic few-shot example library for all AI features.
 *
 * Retrieval pipeline:
 *   1. Embed the caller-supplied context with text-embedding-3-small (optional).
 *   2. Run HNSW vector search + BM25 full-text search in parallel.
 *   3. Fuse both result sets with RRF (k=60) via the shared core engine.
 *   4. Re-rank the candidate pool with Voyage rerank-2 (Gemini fallback).
 *   5. Hydrate and return up to `limit` examples in reranker order.
 *
 * Indexing pipeline:
 *   buildFewShotRetrievalContent → generateEmbedding → DB update
 *
 * Designed for failure: any retrieval exception returns [] so the AI path
 * never crashes.
 */

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { fewShotExamples } from "@/db/schema/ai";
import type { PromptExample } from "@/lib/ai-core/types";
import {
  LANG_TO_PG_CONFIG,
  type PgLanguage,
  buildRRFCandidatePool,
  textMatchSql,
  textRankSql,
  vectorSimilaritySql,
} from "@/lib/rag/core";
import { generateEmbedding } from "@/lib/rag/embeddings";
import { rerank } from "@/lib/rag/reranker";
import type { SearchResult } from "@/lib/rag/search";

// ─── Internal Helpers ────────────────────────────────────────────────────────

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(Object.entries(value));
}

function getPgLanguage(locale?: string): PgLanguage {
  return LANG_TO_PG_CONFIG[locale ?? "en"] ?? "english";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type GetDynamicExamplesOptions = {
  feature: string;
  limit?: number;
  /**
   * Natural-language context string used for semantic (vector) recall.
   * Falls back to BM25-only retrieval on the feature name when omitted.
   */
  context?: string;
  /** BCP-47 locale for the full-text search config (default: "en"). */
  locale?: string;
};

// ─── Indexing ─────────────────────────────────────────────────────────────────

/**
 * Builds a flat, keyword-rich string from a few-shot example's metadata so
 * that BM25 can surface it on keywords alone (e.g. searching by feature name
 * or tag without a context embedding).
 *
 * This is intentionally kept separate from the generic `buildRetrievalContent`
 * helper because few-shot examples have a domain-specific shape (feature+tags
 * header, JSON content body).
 */
export function buildFewShotRetrievalContent(params: {
  feature: string;
  tags: string[];
  content: Record<string, unknown>;
}): string {
  const tagLine = params.tags.length > 0 ? `Tags: ${params.tags.join(", ")}` : "";
  const contentText = JSON.stringify(params.content, null, 0);
  return [`Feature: ${params.feature}`, tagLine, contentText].filter(Boolean).join("\n");
}

/**
 * Re-generates the `retrievalContent` and `embedding` for an existing
 * few-shot example record. Call this immediately after insert or update so
 * the HNSW and GIN indexes stay current.
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

// ─── Retrieval ────────────────────────────────────────────────────────────────

/**
 * Retrieves the most relevant few-shot examples for a given feature and
 * context using the full RAG pipeline (vector + BM25 → RRF → rerank).
 */
export async function getDynamicFewShotExamples({
  feature,
  limit = 3,
  context = "",
  locale = "en",
}: GetDynamicExamplesOptions): Promise<PromptExample[]> {
  try {
    const db = getDb();
    const lang = getPgLanguage(locale);
    const searchText = context.trim() || feature;

    const featureFilter = and(
      eq(fewShotExamples.feature, feature),
      eq(fewShotExamples.isActive, true),
    );

    // ─── Phase 1: Vector recall via HNSW (skipped when no context) ──────────
    let vectorResults: SearchResult[] = [];
    if (context.trim()) {
      const queryVector = JSON.stringify(
        await generateEmbedding(context, { feature }),
      );
      const scoreSql = vectorSimilaritySql(fewShotExamples.embedding, queryVector);

      const rows = await db
        .select({
          id: fewShotExamples.id,
          content: fewShotExamples.retrievalContent,
          metadata: fewShotExamples.metadata,
          score: scoreSql,
        })
        .from(fewShotExamples)
        .where(and(featureFilter, sql`${fewShotExamples.embedding} IS NOT NULL`))
        .orderBy(sql`${fewShotExamples.embedding} <=> ${queryVector}::vector ASC`)
        .limit(limit * 8);

      vectorResults = rows.map((r) => ({
        id: r.id,
        content: r.content,
        score: r.score,
        metadata: normalizeMetadata(r.metadata),
        sourceType: "few_shot_example",
        createdAt: new Date(),
      }));
    }

    // ─── Phase 2: BM25 full-text recall via GIN ──────────────────────────────
    const rankSql = textRankSql(fewShotExamples.retrievalContent, searchText, lang);
    const matchSql = textMatchSql(fewShotExamples.retrievalContent, searchText, lang);

    const bm25Rows = await db
      .select({
        id: fewShotExamples.id,
        content: fewShotExamples.retrievalContent,
        metadata: fewShotExamples.metadata,
        score: rankSql,
      })
      .from(fewShotExamples)
      .where(and(featureFilter, matchSql))
      .orderBy(desc(rankSql))
      .limit(limit * 8);

    const textResults: SearchResult[] = bm25Rows.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.score,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      sourceType: "few_shot_example",
      createdAt: new Date(),
    }));

    // ─── Phase 3: RRF fusion ─────────────────────────────────────────────────
    const candidatePool = buildRRFCandidatePool(vectorResults, textResults, limit * 10);
    if (candidatePool.length === 0) return [];

    // ─── Phase 4: Rerank ──────────────────────────────────────────────────────
    const reranked = await rerank(searchText, candidatePool, limit, { feature });
    const finalIds = reranked.map((r) => r.id);

    // ─── Phase 5: Hydrate full `content` JSON from DB in reranker order ──────
    // We only stored `retrievalContent` in the candidate pool; the actual
    // structured PromptExample lives in the `content` jsonb column.
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
    console.error(`[few-shot-library] Retrieval failed for feature=${feature}`, error);
    return [];
  }
}
