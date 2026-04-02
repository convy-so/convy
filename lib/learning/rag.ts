import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { learningMaterialEmbeddings } from "@/db/schema";
import { chunkText, generateEmbedding, generateEmbeddings } from "@/lib/rag/embeddings";
import { rerank } from "@/lib/rag/reranker";

export async function replaceLearningMaterialEmbeddings(params: {
  topicId: string;
  materialId: string;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  await getDb()
    .delete(learningMaterialEmbeddings)
    .where(
      and(
        eq(learningMaterialEmbeddings.topicId, params.topicId),
        eq(learningMaterialEmbeddings.materialId, params.materialId),
      ),
    );

  const chunks = chunkText(params.content, { maxTokens: 350, overlap: 50 });
  if (chunks.length === 0) return [];

  const embeddings = await generateEmbeddings(chunks, {
    surveyId: params.topicId,
  });

  return await getDb()
    .insert(learningMaterialEmbeddings)
    .values(
      chunks.map((content, index) => ({
        id: nanoid(),
        topicId: params.topicId,
        materialId: params.materialId,
        chunkIndex: index,
        content,
        metadata: params.metadata ?? {},
        embedding: embeddings[index],
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    )
    .returning();
}

export async function searchLearningTopicContext(params: {
  topicId: string;
  query: string;
  limit?: number;
}) {
  const limit = params.limit ?? 8;
  const queryVector = JSON.stringify(await generateEmbedding(params.query));

  const vectorResults = await getDb()
    .select({
      id: learningMaterialEmbeddings.id,
      content: learningMaterialEmbeddings.content,
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

  const textQuery = sql`websearch_to_tsquery('english', ${params.query})`;
  const textResults = await getDb()
    .select({
      id: learningMaterialEmbeddings.id,
      content: learningMaterialEmbeddings.content,
      metadata: learningMaterialEmbeddings.metadata,
      materialId: learningMaterialEmbeddings.materialId,
      score: sql<number>`ts_rank(to_tsvector('english', ${learningMaterialEmbeddings.content}), ${textQuery})`,
    })
    .from(learningMaterialEmbeddings)
    .where(
      and(
        eq(learningMaterialEmbeddings.topicId, params.topicId),
        sql`to_tsvector('english', ${learningMaterialEmbeddings.content}) @@ ${textQuery}`,
      ),
    )
    .orderBy(desc(sql`ts_rank(to_tsvector('english', ${learningMaterialEmbeddings.content}), ${textQuery})`))
    .limit(limit * 5);

  const merged = new Map<
    string,
    {
      id: string;
      content: string;
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
      content: row.content,
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
