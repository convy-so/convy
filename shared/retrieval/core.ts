
import { type AnyColumn, sql, type SQL } from "drizzle-orm";

import { type UsageLogInput } from "@/shared/billing/logger";
import { buildRetrievalContent, hashContent } from "@/shared/retrieval/metadata";
import {
  chunkText,
  countTokens,
  generateBatchEmbeddings,
  type ChunkOptions,
} from "./embeddings";
import { requireValue } from "@/shared/utils/collections";

// ─── Re-export constants so callers have one import path ─────────────────────
export {
  STANDARD_MODEL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_VERSION,
  DEFAULT_CHUNKING_VERSION,
} from "./embeddings";

// ─── 1. INDEXING UTILITIES ───────────────────────────────────────────────────

export type HeaderEntry = { label: string; value: string | number | boolean | null | undefined | Array<string | number | boolean | null | undefined> };

export type PreparedChunk = {
  /** The raw text of this chunk (stored in rawContent). */
  rawContent: string;
  /** The header-prefixed searchable text (stored in retrievalContent). */
  retrievalContent: string;
  /** The vector embedding for this chunk. */
  embedding: number[];
  /** SHA-256 hex hash of rawContent for change-detection. */
  contentHash: string;
  /** Token count of rawContent for storage/analytics. */
  tokenCount: number;
  /** Zero-based position within the document. */
  chunkIndex: number;
};

export type PrepareEmbeddingsParams = {
  /** The full document text to chunk and embed. */
  content: string;
  /**
   * Metadata header entries prepended to each chunk's retrievalContent.
   */
  headerEntries: HeaderEntry[];
  /** Token chunking config. Defaults: maxTokens=400. */
  chunkOptions?: ChunkOptions;
  /** Usage attribution forwarded to the billing logger. */
  attribution?: Partial<UsageLogInput>;
};

/**
 * The single indexing entry-point for every AI feature.
 *
 * Given raw document text + metadata headers, it:
 *   1. Splits the text into non-overlapping chunks.
 *   2. Wraps each chunk in a retrieval-content header.
 *   3. Generates embeddings using the standard Voyage model (voyage-4).
 *   4. Returns a typed array of `PreparedChunk` ready for DB insertion.
 */
export async function prepareEmbeddingsForIndexing(
  params: PrepareEmbeddingsParams,
): Promise<PreparedChunk[]> {
  const chunks = chunkText(params.content, params.chunkOptions ?? { maxTokens: 400 });
  if (chunks.length === 0) return [];

  const retrievalChunks = chunks.map((chunk) =>
    buildRetrievalContent({
      headerEntries: params.headerEntries,
      rawContent: chunk,
    }),
  );

  // All chunks as independent items in a flat batch using voyage-4
  const embeddings = await generateBatchEmbeddings(chunks, params.attribution);

  return chunks.map((rawContent, index) => ({
    rawContent,
    retrievalContent: requireValue(
      retrievalChunks[index],
      `Missing retrieval content for chunk ${index}.`,
    ),
    embedding: embeddings[index] ?? [],
    contentHash: hashContent(rawContent),
    tokenCount: countTokens(rawContent),
    chunkIndex: index,
  }));
}

// ─── 2. SQL QUERY HELPERS ────────────────────────────────────────────────────

/**
 * Supported Postgres full-text-search language configurations.
 * Postgres supports many more but these are the ones Convy indexes.
 */
export type PgLanguage = "english" | "german" | "french";

export const LANG_TO_PG_CONFIG: Record<string, PgLanguage> = {
  en: "english",
  de: "german",
  fr: "french",
};

/**
 * Returns a SQL fragment that computes cosine *similarity* (0–1, higher=better)
 * between a stored embedding column and a query vector.
 *
 * Uses pgvector's `<=>` cosine *distance* operator and inverts it so that
 * calling code can sort DESC (highest first) to get best matches.
 *
 * @param embeddingColumn  A Drizzle column reference, e.g. `table.embedding`.
 * @param queryVectorJson  The query embedding serialised as a JSON string.
 */
export function vectorSimilaritySql(
  embeddingColumn: AnyColumn | SQL<unknown>,
  queryVectorJson: string,
): SQL<number> {
  return sql<number>`1 - (${embeddingColumn} <=> ${queryVectorJson}::vector)`;
}

/**
 * Returns a SQL fragment for the Postgres `ts_rank` full-text relevance score.
 * Sort DESC for highest relevance first.
 *
 * @param retrievalColumn  A Drizzle column reference for the text column.
 * @param query            The raw user query string.
 * @param language         The Postgres FTS config (default: "english").
 */
export function textRankSql(
  retrievalColumn: AnyColumn | SQL<unknown>,
  query: string,
  language: PgLanguage = "english",
): SQL<number> {
  return sql<number>`ts_rank(
    to_tsvector(${language}, ${retrievalColumn}),
    websearch_to_tsquery(${language}, ${query})
  )`;
}

/**
 * Returns a boolean SQL fragment (for use in `where`) that tests whether a
 * full-text-search column matches a query.
 *
 * @param retrievalColumn  A Drizzle column reference for the text column.
 * @param query            The raw user query string.
 * @param language         The Postgres FTS config (default: "english").
 */
export function textMatchSql(
  retrievalColumn: AnyColumn | SQL<unknown>,
  query: string,
  language: PgLanguage = "english",
): SQL<boolean> {
  return sql<boolean>`to_tsvector(${language}, ${retrievalColumn}) @@ websearch_to_tsquery(${language}, ${query})`;
}

// ─── 3. HYBRID RETRIEVAL UTILITIES ───────────────────────────────────────────

/**
 * The minimum shape every caller must supply when merging result sets.
 * Each feature can extend this with its own extra columns.
 */
export type HybridSearchRow = {
  id: string;
  score: number;
};

/**
 * Reciprocal Rank Fusion (RRF) — merges two ranked result lists.
 *
 * Algorithm (Cormack et al., 2009 — the gold standard for heterogeneous
 * result fusion):
 *   RRF_score(d) = Σ  1 / (k + rank(d))
 *
 * k=60 is the empirically validated default that provides stable scores
 * across short and long ranked lists. Pinecone, Weaviate, and pgvector all
 * use this value in their hybrid-search documentation.
 *
 * @param vectorResults  Results sorted by vector similarity (best first).
 * @param textResults    Results sorted by BM25 rank (best first).
 * @param limit          Maximum number of results to return.
 * @returns Fused + sorted candidate pool, capped at `limit` entries.
 */
export function fuseWithRRF<T extends HybridSearchRow>(
  vectorResults: T[],
  textResults: T[],
  limit: number,
  k = 60,
): T[] {
  const rrfScores = new Map<string, number>();
  const candidateMap = new Map<string, T>();

  vectorResults.forEach((row, i) => {
    rrfScores.set(row.id, (rrfScores.get(row.id) ?? 0) + 1 / (k + i + 1));
    candidateMap.set(row.id, row);
  });

  textResults.forEach((row, i) => {
    rrfScores.set(row.id, (rrfScores.get(row.id) ?? 0) + 1 / (k + i + 1));
    // Prefer the vector result when both exist (it has the embedding score)
    if (!candidateMap.has(row.id)) candidateMap.set(row.id, row);
  });

  return Array.from(rrfScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, rrfScore]) => ({
      ...requireValue(candidateMap.get(id), `Missing fused candidate ${id}.`),
      score: rrfScore,
    }));
}

/**
 * Convenience wrapper: fuse two result sets then slice to the requested limit
 * without capping the candidate pool first. Intended for callers that want to
 * over-fetch before passing into `rerank()`.
 *
 * @param vectorResults  Best-first vector results.
 * @param textResults    Best-first BM25 results.
 * @param candidateLimit How many fused candidates to pass downstream.
 */
export function buildRRFCandidatePool<T extends HybridSearchRow>(
  vectorResults: T[],
  textResults: T[],
  candidateLimit: number,
): T[] {
  // No internal limit — gather all, sort, then slice
  const rrfScores = new Map<string, number>();
  const candidateMap = new Map<string, T>();
  const k = 60;

  vectorResults.forEach((row, i) => {
    rrfScores.set(row.id, (rrfScores.get(row.id) ?? 0) + 1 / (k + i + 1));
    candidateMap.set(row.id, row);
  });

  textResults.forEach((row, i) => {
    rrfScores.set(row.id, (rrfScores.get(row.id) ?? 0) + 1 / (k + i + 1));
    if (!candidateMap.has(row.id)) candidateMap.set(row.id, row);
  });

  return Array.from(rrfScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, candidateLimit)
    .map(([id, rrfScore]) => ({
      ...requireValue(candidateMap.get(id), `Missing fused candidate ${id}.`),
      score: rrfScore,
    }));
}
