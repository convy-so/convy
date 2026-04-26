import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { learningMaterialEmbeddings } from "@/db/schema";
import {
  chunkText,
  countTokens,
  DEFAULT_CHUNKING_VERSION,
  EMBEDDING_MODEL_NAME,
  EMBEDDING_VERSION,
  generateEmbedding,
  generateEmbeddings,
} from "@/lib/rag/embeddings";
import { rerank } from "@/lib/rag/reranker";
import { buildRetrievalContent, hashContent } from "@/lib/retrieval/metadata";

const langConfigMap: Record<string, string> = {
  en: "english",
  fr: "french",
  de: "german",
};

function buildMaterialRetrievalContent(params: {
  rawContent: string;
  topicTitle?: string | null;
  materialTitle?: string | null;
  materialKind?: string | null;
  subjectKey?: string | null;
  gradeBand?: string | null;
  locale?: string | null;
}) {
  return buildRetrievalContent({
    headerEntries: [
      { label: "Topic", value: params.topicTitle },
      { label: "Material title", value: params.materialTitle },
      { label: "Material kind", value: params.materialKind },
      { label: "Subject", value: params.subjectKey },
      { label: "Grade band", value: params.gradeBand },
      { label: "Language", value: params.locale },
    ],
    rawContent: params.rawContent,
  });
}

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
  const chunks = chunkText(params.content, { maxTokens: 350, overlap: 50 });
  if (chunks.length === 0) return [];

  const retrievalChunks = chunks.map((chunk) =>
    buildMaterialRetrievalContent({
      rawContent: chunk,
      topicTitle: params.topicTitle,
      materialTitle: params.materialTitle,
      materialKind: params.materialKind,
      subjectKey: params.subjectKey,
      gradeBand: params.gradeBand,
      locale: params.contentLocale,
    }),
  );
  const embeddings = await generateEmbeddings(retrievalChunks, {
    feature: "learning-material-indexing",
  });

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
        chunks.map((content, index) => ({
          id: nanoid(),
          classroomId: params.classroomId ?? null,
          topicId: params.topicId,
          materialId: params.materialId,
          chunkIndex: index,
          subjectKey: params.subjectKey ?? null,
          gradeBand: params.gradeBand ?? null,
          contentLocale: params.contentLocale ?? "en",
          materialKind: params.materialKind ?? null,
          materialTitle: params.materialTitle ?? null,
          embeddingModel: EMBEDDING_MODEL_NAME,
          embeddingVersion: EMBEDDING_VERSION,
          chunkingVersion: DEFAULT_CHUNKING_VERSION,
          contentHash: hashContent(content),
          sourceUpdatedAt: params.sourceUpdatedAt ?? new Date(),
          tokenCount: countTokens(content),
          rawContent: content,
          retrievalContent: retrievalChunks[index],
          content,
          metadata: params.metadata ?? {},
          embedding: embeddings[index],
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      )
      .returning();
  });
}

export async function searchLearningTopicContext(params: {
  topicId: string;
  query: string;
  limit?: number;
  contentLocale?: string;
}) {
  const limit = params.limit ?? 8;
  const contentLocale = params.contentLocale ?? "en";
  const tsConfig = langConfigMap[contentLocale] ?? "english";
  const queryVector = JSON.stringify(await generateEmbedding(params.query, {
    feature: "learning-topic-search",
  }));

  const vectorResults = await getDb()
    .select({
      id: learningMaterialEmbeddings.id,
      content: learningMaterialEmbeddings.rawContent,
      retrievalContent: learningMaterialEmbeddings.retrievalContent,
      metadata: learningMaterialEmbeddings.metadata,
      materialId: learningMaterialEmbeddings.materialId,
      score: sql<number>`1 - (${learningMaterialEmbeddings.embedding} <=> ${queryVector})`,
    })
    .from(learningMaterialEmbeddings)
    .where(
      and(
        eq(learningMaterialEmbeddings.topicId, params.topicId),
        sql`${learningMaterialEmbeddings.embedding} IS NOT NULL`,
      ),
    )
    .orderBy(sql`${learningMaterialEmbeddings.embedding} <=> ${queryVector} ASC`)
    .limit(limit * 5);

  const textQuery = sql`websearch_to_tsquery(${tsConfig}, ${params.query})`;
  const textResults = await getDb()
    .select({
      id: learningMaterialEmbeddings.id,
      content: learningMaterialEmbeddings.rawContent,
      retrievalContent: learningMaterialEmbeddings.retrievalContent,
      metadata: learningMaterialEmbeddings.metadata,
      materialId: learningMaterialEmbeddings.materialId,
      score: sql<number>`ts_rank(to_tsvector(${tsConfig}, ${learningMaterialEmbeddings.retrievalContent}), ${textQuery})`,
    })
    .from(learningMaterialEmbeddings)
    .where(
      and(
        eq(learningMaterialEmbeddings.topicId, params.topicId),
        eq(learningMaterialEmbeddings.contentLocale, contentLocale),
        sql`to_tsvector(${tsConfig}, ${learningMaterialEmbeddings.retrievalContent}) @@ ${textQuery}`,
      ),
    )
    .orderBy(
      desc(
        sql`ts_rank(to_tsvector(${tsConfig}, ${learningMaterialEmbeddings.retrievalContent}), ${textQuery})`,
      ),
    )
    .limit(limit * 5);

  const merged = new Map<
    string,
    {
      id: string;
      content: string;
      retrievalContent: string;
      metadata: Record<string, unknown> | null;
      materialId: string;
      score: number;
    }
  >();

  for (const row of [...vectorResults, ...textResults]) {
    const existing = merged.get(row.id);
    if (!existing || row.score > existing.score) {
      merged.set(row.id, {
        id: row.id,
        content: row.content,
        retrievalContent: row.retrievalContent,
        metadata: row.metadata as Record<string, unknown> | null,
        materialId: row.materialId,
        score: row.score,
      });
    }
  }

  const reranked = await rerank(
    params.query,
    Array.from(merged.values()).slice(0, limit * 8).map((row) => ({
      id: row.id,
      content: row.retrievalContent,
      metadata: row.metadata ?? {},
      sourceType: "document",
      sourceId: row.materialId,
      score: row.score,
      createdAt: new Date(),
    })),
    limit,
  );

  return reranked;
}
