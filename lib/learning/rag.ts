import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { learningMaterialEmbeddings } from "@/db/schema";
import {
  STANDARD_MODEL,
  EMBEDDING_VERSION,
  DEFAULT_CHUNKING_VERSION,
  LANG_TO_PG_CONFIG,
  type PgLanguage,
  buildRRFCandidatePool,
  prepareEmbeddingsForIndexing,
  textMatchSql,
  textRankSql,
  vectorSimilaritySql,
} from "@/lib/rag/core";
import { generateEmbedding } from "@/lib/rag/embeddings";
import { rerank } from "@/lib/rag/reranker";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPgLanguage(locale?: string): PgLanguage {
  return LANG_TO_PG_CONFIG[locale ?? "en"] ?? "english";
}

// ─── Indexing ─────────────────────────────────────────────────────────────────

/**
 * Replaces all stored embedding chunks for a learning material.
 *
 * Idempotent: deletes existing chunks for (topicId, materialId) then
 * re-inserts fresh ones. Safe to call on every content update.
 */
export async function replaceLearningMaterialEmbeddings(params: {
  classroomId?: string | null;
  topicId: string;
  materialId: string;
  content: string;
  topicTitle?: string | null;
  materialTitle?: string | null;
  materialKind?: string | null;
  subjectKey?: string | null;
  gradeBand?: string | null;
  contentLocale?: string | null;
  sourceUpdatedAt?: Date | null;
  metadata?: Record<string, unknown>;
}) {
  const chunks = await prepareEmbeddingsForIndexing({
    content: params.content,
    chunkOptions: { maxTokens: 350 },
    headerEntries: [
      { label: "Topic", value: params.topicTitle },
      { label: "Material title", value: params.materialTitle },
      { label: "Material kind", value: params.materialKind },
      { label: "Subject", value: params.subjectKey },
      { label: "Grade band", value: params.gradeBand },
      { label: "Language", value: params.contentLocale },
    ],
    attribution: { feature: "learning-material-indexing" },
  });

  if (chunks.length === 0) return [];

  return await getDb().transaction(async (tx) => {
    await tx
      .delete(learningMaterialEmbeddings)
      .where(
        and(
          eq(learningMaterialEmbeddings.topicId, params.topicId),
          eq(learningMaterialEmbeddings.materialId, params.materialId),
        ),
      );

    return await tx
      .insert(learningMaterialEmbeddings)
      .values(
        chunks.map((chunk) => ({
          id: nanoid(),
          classroomId: params.classroomId ?? null,
          topicId: params.topicId,
          materialId: params.materialId,
          chunkIndex: chunk.chunkIndex,
          subjectKey: params.subjectKey ?? null,
          gradeBand: params.gradeBand ?? null,
          contentLocale: params.contentLocale ?? "en",
          materialKind: params.materialKind ?? null,
          materialTitle: params.materialTitle ?? null,
          embeddingModel: STANDARD_MODEL,
          embeddingVersion: EMBEDDING_VERSION,
          chunkingVersion: DEFAULT_CHUNKING_VERSION,
          contentHash: chunk.contentHash,
          sourceUpdatedAt: params.sourceUpdatedAt ?? new Date(),
          tokenCount: chunk.tokenCount,
          rawContent: chunk.rawContent,
          retrievalContent: chunk.retrievalContent,
          content: chunk.rawContent,
          metadata: params.metadata ?? {},
          embedding: chunk.embedding,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      )
      .returning();
  });
}

// ─── Retrieval ────────────────────────────────────────────────────────────────

/**
 * Hybrid search (vector + BM25, RRF-fused, reranked) over learning material
 * embeddings scoped to a single topic.
 *
 * Pipeline:
 *   1. Vector recall (HNSW cosine similarity).
 *   2. BM25 full-text recall (GIN index).
 *   3. RRF fusion (k=60).
 *   4. Voyage rerank-2 (Gemini fallback).
 */
export async function searchLearningTopicContext(params: {
  topicId: string;
  query: string;
  limit?: number;
  contentLocale?: string;
}) {
  const limit = params.limit ?? 8;
  const lang = getPgLanguage(params.contentLocale);
  const queryVector = JSON.stringify(
    await generateEmbedding(params.query, { 
      feature: "learning-topic-search"
    }),
  );

  const scoreSql = vectorSimilaritySql(learningMaterialEmbeddings.embedding, queryVector);
  const rankSql = textRankSql(learningMaterialEmbeddings.retrievalContent, params.query, lang);
  const matchSql = textMatchSql(learningMaterialEmbeddings.retrievalContent, params.query, lang);

  const [vectorResults, textResults] = await Promise.all([
    getDb()
      .select({
        id: learningMaterialEmbeddings.id,
        content: learningMaterialEmbeddings.rawContent,
        retrievalContent: learningMaterialEmbeddings.retrievalContent,
        metadata: learningMaterialEmbeddings.metadata,
        materialId: learningMaterialEmbeddings.materialId,
        score: scoreSql,
      })
      .from(learningMaterialEmbeddings)
      .where(
        and(
          eq(learningMaterialEmbeddings.topicId, params.topicId),
          sql`${learningMaterialEmbeddings.embedding} IS NOT NULL`,
        ),
      )
      .orderBy(sql`${learningMaterialEmbeddings.embedding} <=> ${queryVector}::vector ASC`)
      .limit(limit * 5),

    getDb()
      .select({
        id: learningMaterialEmbeddings.id,
        content: learningMaterialEmbeddings.rawContent,
        retrievalContent: learningMaterialEmbeddings.retrievalContent,
        metadata: learningMaterialEmbeddings.metadata,
        materialId: learningMaterialEmbeddings.materialId,
        score: rankSql,
      })
      .from(learningMaterialEmbeddings)
      .where(
        and(
          eq(learningMaterialEmbeddings.topicId, params.topicId),
          eq(learningMaterialEmbeddings.contentLocale, params.contentLocale ?? "en"),
          matchSql,
        ),
      )
      .orderBy(desc(rankSql))
      .limit(limit * 5),
  ]);

  const candidatePool = buildRRFCandidatePool(vectorResults, textResults, limit * 8).map((row) => ({
    id: row.id,
    content: row.retrievalContent ?? row.content,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    sourceType: "document" as const,
    sourceId: row.materialId,
    score: row.score,
    createdAt: new Date(),
  }));

  return rerank(params.query, candidatePool, limit, { feature: "learning-topic-search" });
}
