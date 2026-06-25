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
 *   buildFewShotRetrievalContent â†’ generateEmbedding â†’ DB update
 *
 * Designed for failure: any retrieval exception returns [] so the AI path
 * never crashes.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { fewShotExamples } from "@/shared/db/schema/ai";
import type { PromptExample } from "@/shared/ai/core/prompt-context-types";
import {
  LANG_TO_PG_CONFIG,
  type PgLanguage,
  buildRRFCandidatePool,
  textMatchSql,
  textRankSql,
  vectorSimilaritySql,
} from "@/shared/retrieval/core";
import { generateEmbedding } from "@/shared/retrieval/embeddings";
import { rerank } from "@/shared/retrieval/reranker";
import type { SearchResult } from "@/shared/retrieval/search";
import { createLogger, serializeError } from "@/shared/infra/logger";

const log = createLogger("few-shot-library");
const FEW_SHOT_CACHE_TTL_MS = 5 * 60 * 1000;
const fewShotResultCache = new Map<
  string,
  { expiresAt: number; value: PromptExample[] }
>();


// â”€â”€â”€ Internal Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(Object.entries(value));
}

function getPgLanguage(locale?: string): PgLanguage {
  return LANG_TO_PG_CONFIG[locale ?? "en"] ?? "english";
}

function getFewShotCacheKey(input: {
  feature: string;
  limit: number;
  context: string;
  locale: string;
}) {
  return [
    input.feature,
    input.limit,
    input.locale,
    input.context.trim().toLowerCase().replace(/\s+/g, " "),
  ].join("::");
}

function readCachedFewShotExamples(cacheKey: string) {
  const cached = fewShotResultCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    fewShotResultCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function writeCachedFewShotExamples(cacheKey: string, value: PromptExample[]) {
  fewShotResultCache.set(cacheKey, {
    expiresAt: Date.now() + FEW_SHOT_CACHE_TTL_MS,
    value,
  });
}

function shouldBypassSemanticRetrieval(context: string) {
  const normalized = context.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.length < 24) return true;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return true;
  return new Set(tokens).size <= 2;
}

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Indexing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

export async function prepareFewShotExampleIndex(params: {
  feature: string;
  tags: string[];
  content: Record<string, unknown>;
}) {
  const retrievalContent = buildFewShotRetrievalContent(params);
  const embedding = await generateEmbedding(retrievalContent, {
    feature: params.feature,
  });

  return { retrievalContent, embedding };
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
  const { retrievalContent, embedding } = await prepareFewShotExampleIndex(params);

  await getDb()
    .update(fewShotExamples)
    .set({ retrievalContent, embedding, updatedAt: new Date() })
    .where(eq(fewShotExamples.id, params.id));
}

// â”€â”€â”€ Retrieval â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Retrieves the most relevant few-shot examples for a given feature and
 * context using the full RAG pipeline (vector + BM25 â†’ RRF â†’ rerank).
 */
export async function getDynamicFewShotExamples({
  feature,
  limit = 3,
  context = "",
  locale = "en",
}: GetDynamicExamplesOptions): Promise<PromptExample[]> {
  const cacheKey = getFewShotCacheKey({ feature, limit, context, locale });
  const cached = readCachedFewShotExamples(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const db = getDb();
    const lang = getPgLanguage(locale);
    const searchText = context.trim() || feature;

    const featureFilter = and(
      eq(fewShotExamples.feature, feature),
      eq(fewShotExamples.isActive, true),
    );

    // â”€â”€â”€ Phase 1: Vector recall via HNSW (skipped when no context) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let vectorResults: SearchResult[] = [];
    if (context.trim() && !shouldBypassSemanticRetrieval(context)) {
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

    // â”€â”€â”€ Phase 2: BM25 full-text recall via GIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      metadata: normalizeMetadata(r.metadata),
      sourceType: "few_shot_example",
      createdAt: new Date(),
    }));

    // â”€â”€â”€ Phase 3: RRF fusion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const candidatePool = buildRRFCandidatePool(vectorResults, textResults, limit * 10);
    if (candidatePool.length === 0) return [];

    // â”€â”€â”€ Phase 4: Rerank â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const finalIds =
      candidatePool.length <= limit
        ? candidatePool.slice(0, limit).map((item) => item.id)
        : (await rerank(searchText, candidatePool, limit, { feature })).map(
            (item) => item.id,
          );

    // â”€â”€â”€ Phase 5: Hydrate full `content` JSON from DB in reranker order â”€â”€â”€â”€â”€â”€
    // We only stored `retrievalContent` in the candidate pool; the actual
    // structured PromptExample lives in the `content` jsonb column.
    const hydrated = await db.query.fewShotExamples.findMany({
      where: and(
        featureFilter,
        inArray(fewShotExamples.id, finalIds),
      ),
    });

    const hydratedMap = new Map(hydrated.map((h) => [h.id, h]));
    const finalExamples = finalIds
      .map((id) => hydratedMap.get(id)?.content as PromptExample | undefined)
      .filter((c): c is PromptExample => c !== undefined);
    writeCachedFewShotExamples(cacheKey, finalExamples);
    return finalExamples;
  } catch (error) {
    log.error("Retrieval failed", {
      feature,
      ...serializeError(error),
    });

    try {
      const fallbackRows = await getDb().query.fewShotExamples.findMany({
        where: and(
          eq(fewShotExamples.feature, feature),
          eq(fewShotExamples.isActive, true),
        ),
        orderBy: [desc(fewShotExamples.updatedAt)],
        limit,
      });

      const fallbackExamples = fallbackRows
        .map((row) => row.content as PromptExample)
        .filter((row) => row !== undefined);
      writeCachedFewShotExamples(cacheKey, fallbackExamples);
      return fallbackExamples;
    } catch (fallbackError) {
      log.error("Few-shot fallback retrieval failed", {
        feature,
        ...serializeError(fallbackError),
      });
      return [];
    }
  }
}
