import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { learningEvidenceEmbeddings } from "@/shared/db/schema";
import {
  buildRRFCandidatePool,
  textMatchSql,
  textRankSql,
  vectorSimilaritySql,
} from "@/shared/retrieval/core";
import { generateEmbedding } from "@/shared/retrieval/embeddings";
import { rerank } from "@/shared/retrieval/reranker";

import { type EvidenceContextItem, getPgLanguage } from "./evidence-domain";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEvidenceSourceType(
  value: unknown,
): value is EvidenceContextItem["sourceType"] {
  return (
    value === "material" ||
    value === "report" ||
    value === "interaction" ||
    value === "pattern"
  );
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export async function searchStudentLearningEvidenceContext(params: {
  classroomStudentId: string;
  query: string;
  language?: string;
  limit?: number;
}): Promise<EvidenceContextItem[]> {
  const limit = params.limit ?? 8;
  const lang = getPgLanguage(params.language);
  const queryVector = JSON.stringify(
    await generateEmbedding(params.query, { feature: "learning-evidence-search" }),
  );

  const scoreSql = vectorSimilaritySql(learningEvidenceEmbeddings.embedding, queryVector);
  const rankSql = textRankSql(learningEvidenceEmbeddings.retrievalContent, params.query, lang);
  const matchSql = textMatchSql(learningEvidenceEmbeddings.retrievalContent, params.query, lang);

  const [vectorRows, textRows] = await Promise.all([
    getDb()
      .select({
        id: learningEvidenceEmbeddings.id,
        content: learningEvidenceEmbeddings.rawContent,
        retrievalContent: learningEvidenceEmbeddings.retrievalContent,
        metadata: learningEvidenceEmbeddings.metadata,
        sourceType: learningEvidenceEmbeddings.sourceType,
        sourceId: learningEvidenceEmbeddings.sourceId,
        score: scoreSql,
      })
      .from(learningEvidenceEmbeddings)
      .where(
        and(
          eq(learningEvidenceEmbeddings.classroomStudentId, params.classroomStudentId),
          sql`${learningEvidenceEmbeddings.embedding} IS NOT NULL`,
        ),
      )
      .orderBy(sql`${learningEvidenceEmbeddings.embedding} <=> ${queryVector}::vector ASC`)
      .limit(limit * 6),
    getDb()
      .select({
        id: learningEvidenceEmbeddings.id,
        content: learningEvidenceEmbeddings.rawContent,
        retrievalContent: learningEvidenceEmbeddings.retrievalContent,
        metadata: learningEvidenceEmbeddings.metadata,
        sourceType: learningEvidenceEmbeddings.sourceType,
        sourceId: learningEvidenceEmbeddings.sourceId,
        score: rankSql,
      })
      .from(learningEvidenceEmbeddings)
      .where(
        and(
          eq(learningEvidenceEmbeddings.classroomStudentId, params.classroomStudentId),
          eq(learningEvidenceEmbeddings.language, params.language ?? "en"),
          matchSql,
        ),
      )
      .orderBy(desc(rankSql))
      .limit(limit * 6),
  ]);

  const candidatePool = buildRRFCandidatePool(vectorRows, textRows, limit * 8).map((row) => ({
    id: row.id,
    content: row.retrievalContent ?? row.content,
    metadata: normalizeMetadata(row.metadata),
    sourceType: "material",
    sourceId: row.sourceId,
    score: row.score,
    createdAt: new Date(),
  }));

  const reranked = await rerank(params.query, candidatePool, limit, {
    feature: "learning-evidence-search",
  });

  const rowById = new Map([...vectorRows, ...textRows].map((row) => [row.id, row]));

  return reranked.flatMap((item): EvidenceContextItem[] => {
    const row = rowById.get(item.id);
    if (!row) {
      return [];
    }

    return [
      {
        id: row.id,
        content: row.content,
        score: item.score,
        sourceType: isEvidenceSourceType(row.sourceType) ? row.sourceType : "material",
        sourceId: row.sourceId,
        metadata: normalizeMetadata(row.metadata),
      },
    ];
  });
}
