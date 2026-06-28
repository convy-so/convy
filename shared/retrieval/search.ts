import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { generateText, Output } from "ai";
import { z } from "zod";

import { flashLiteModel } from "@/shared/ai/language-models";
import { getDb } from "@/shared/db";
import { documentEmbeddings } from "@/shared/db/schema/vectors";
import type { AppLocale } from "@/shared/i18n/config";
import { generateEmbedding } from "./embeddings";
import {
  LANG_TO_PG_CONFIG,
  type PgLanguage,
  buildRRFCandidatePool,
  textMatchSql,
  textRankSql,
  vectorSimilaritySql,
} from "./core";
import { rerank } from "./reranker";
import type { SearchFilters, SearchResult } from "./types";

type SupportedLanguage = AppLocale;

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(Object.entries(value));
}

function getPgLanguage(lang?: string): PgLanguage {
  return LANG_TO_PG_CONFIG[lang ?? "en"] ?? "english";
}

/**
 * Pure vector (HNSW) search over survey document embeddings.
 * Returns results sorted by cosine similarity, highest first.
 */
export async function vectorSearch(
  query: string,
  filters: SearchFilters = {},
): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query, {
    surveyId: filters.surveyId,
  });
  const limit = filters.limit ?? 20;
  const queryVector = JSON.stringify(embedding);
  const scoreSql = vectorSimilaritySql(documentEmbeddings.embedding, queryVector);

  const rows = await getDb()
    .select({
      id: documentEmbeddings.id,
      content: documentEmbeddings.rawContent,
      retrievalContent: documentEmbeddings.retrievalContent,
      metadata: documentEmbeddings.metadata,
      sourceType: documentEmbeddings.sourceType,
      sourceId: documentEmbeddings.sourceId,
      createdAt: documentEmbeddings.createdAt,
      score: scoreSql,
    })
    .from(documentEmbeddings)
    .where(
      and(
        filters.surveyId ? eq(documentEmbeddings.surveyId, filters.surveyId) : undefined,
        filters.sourceType ? inArray(documentEmbeddings.sourceType, filters.sourceType) : undefined,
        filters.minDate ? gt(documentEmbeddings.createdAt, filters.minDate) : undefined,
        filters.language ? eq(documentEmbeddings.language, filters.language) : undefined,
        filters.sessionType ? eq(documentEmbeddings.sessionType, filters.sessionType) : undefined,
        sql`${documentEmbeddings.embedding} IS NOT NULL`,
      ),
    )
    .orderBy(sql`${documentEmbeddings.embedding} <=> ${queryVector}::vector ASC`)
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    retrievalContent: row.retrievalContent,
    score: row.score,
    metadata: normalizeMetadata(row.metadata),
    sourceType: row.sourceType,
    sourceId: row.sourceId ?? undefined,
    createdAt: row.createdAt,
  }));
}

/**
 * Pure full-text (BM25) search over survey document embeddings.
 * Returns results sorted by ts_rank, highest first.
 */
export async function fullTextSearch(
  query: string,
  filters: SearchFilters = {},
  language: SupportedLanguage = "en",
): Promise<SearchResult[]> {
  const limit = filters.limit ?? 20;
  const lang = getPgLanguage(filters.language ?? language);
  const rankSql = textRankSql(documentEmbeddings.retrievalContent, query, lang);
  const matchSql = textMatchSql(documentEmbeddings.retrievalContent, query, lang);

  const rows = await getDb()
    .select({
      id: documentEmbeddings.id,
      content: documentEmbeddings.rawContent,
      retrievalContent: documentEmbeddings.retrievalContent,
      metadata: documentEmbeddings.metadata,
      sourceType: documentEmbeddings.sourceType,
      sourceId: documentEmbeddings.sourceId,
      createdAt: documentEmbeddings.createdAt,
      score: rankSql,
    })
    .from(documentEmbeddings)
    .where(
      and(
        filters.surveyId ? eq(documentEmbeddings.surveyId, filters.surveyId) : undefined,
        filters.sourceType ? inArray(documentEmbeddings.sourceType, filters.sourceType) : undefined,
        filters.minDate ? gt(documentEmbeddings.createdAt, filters.minDate) : undefined,
        filters.language ? eq(documentEmbeddings.language, filters.language) : undefined,
        filters.sessionType ? eq(documentEmbeddings.sessionType, filters.sessionType) : undefined,
        matchSql,
      ),
    )
    .orderBy(desc(rankSql))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    retrievalContent: row.retrievalContent,
    score: row.score,
    metadata: normalizeMetadata(row.metadata),
    sourceType: row.sourceType,
    sourceId: row.sourceId ?? undefined,
    createdAt: row.createdAt,
  }));
}

/**
 * Hybrid search: vector + BM25 fused with RRF.
 * Does not rerank; use executeRAGQuery for the full pipeline with reranking.
 */
export async function hybridSearch(
  query: string,
  filters: SearchFilters = {},
  language: SupportedLanguage = "en",
): Promise<SearchResult[]> {
  const limit = filters.limit ?? 20;
  const [vectorResults, textResults] = await Promise.all([
    vectorSearch(query, { ...filters, limit: limit * 2, language: filters.language ?? language }),
    fullTextSearch(query, { ...filters, limit: limit * 2 }, filters.language ?? language),
  ]);

  return buildRRFCandidatePool(vectorResults, textResults, limit);
}

/**
 * Full RAG query pipeline:
 *   1. HyDE query expansion.
 *   2. Parallel hybrid search across all query variants.
 *   3. Global RRF fusion of all partial results.
 *   4. Reranking over the candidate pool.
 *
 * Requires surveyId for safety because survey data is tenant-scoped.
 */
export async function executeRAGQuery(
  rawQuery: string,
  filters: SearchFilters,
  language: SupportedLanguage = "en",
): Promise<SearchResult[]> {
  if (!filters.surveyId) {
    throw new Error("executeRAGQuery requires surveyId.");
  }

  const fetchLimit = filters.limit ?? 20;
  const initialVectorResults = await vectorSearch(rawQuery, {
    ...filters,
    limit: fetchLimit * 2,
    language,
  });
  const initialTextResults = await fullTextSearch(
    rawQuery,
    { ...filters, limit: fetchLimit * 2 },
    language,
  );
  const initialCandidatePool = buildRRFCandidatePool(
    initialVectorResults,
    initialTextResults,
    fetchLimit * 10,
  ).map((result) => ({
    ...result,
    content: result.retrievalContent ?? result.content,
  }));

  if (initialCandidatePool.length >= Math.max(fetchLimit, 8)) {
    const reranked = await rerank(rawQuery, initialCandidatePool, fetchLimit, {
      surveyId: filters.surveyId,
      feature: "rag-query",
    });

    return reranked.map((result) => {
      result.content = `[Source ID: ${result.id}] Context chunk:\n${result.content}`;
      return result;
    });
  }

  const queriesToRun = [rawQuery];

  try {
    const { output: object } = await generateText({
      model: flashLiteModel,
      output: Output.object({
        schema: z.object({
          hydeAnswer: z.string().describe(
            "Write a hypothetical first-person respondent answer to the query constraint.",
          ),
          variants: z
            .array(z.string())
            .describe("3 semantically distinct alternative phrasings of the raw user query."),
        }),
      }),
      prompt: `Original Query: "${rawQuery}"\nLanguage: ${language}\nGenerate a hypothetical answer and query variants only because the first retrieval pass was weak.`,
    });

    if (object.hydeAnswer) queriesToRun.push(object.hydeAnswer);
    if (object.variants?.length) queriesToRun.push(...object.variants.slice(0, 3));
  } catch {
    // Non-fatal: fall through with just the raw query.
  }

  const allVector: SearchResult[] = [...initialVectorResults];
  const allText: SearchResult[] = [...initialTextResults];

  await Promise.all(
    queriesToRun.slice(1).map(async (queryVariant) => {
      const [vectorResults, textResults] = await Promise.all([
        vectorSearch(queryVariant, { ...filters, limit: fetchLimit * 2, language }),
        fullTextSearch(queryVariant, { ...filters, limit: fetchLimit * 2 }, language),
      ]);
      allVector.push(...vectorResults);
      allText.push(...textResults);
    }),
  );

  const candidatePool = buildRRFCandidatePool(allVector, allText, fetchLimit * 10).map(
    (result) => ({
      ...result,
      content: result.retrievalContent ?? result.content,
    }),
  );

  const reranked = await rerank(rawQuery, candidatePool, fetchLimit, {
    surveyId: filters.surveyId,
    feature: "rag-query",
  });

  return reranked.map((result) => {
    result.content = `[Source ID: ${result.id}] Context chunk:\n${result.content}`;
    return result;
  });
}
