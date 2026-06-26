import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { lessonEvidenceEmbeddings } from "@/shared/db/schema";
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

export async function searchStudentEvidenceContext(params: {
  classroomStudentId: string;
  query: string;
  language?: string;
  limit?: number;
}): Promise<EvidenceContextItem[]> {
  const limit = params.limit ?? 8;
  const lang = getPgLanguage(params.language);
  const queryVector = JSON.stringify(
    await generateEmbedding(params.query, { feature: "lesson-evidence-search" }),
  );

  const scoreSql = vectorSimilaritySql(lessonEvidenceEmbeddings.embedding, queryVector);
  const rankSql = textRankSql(lessonEvidenceEmbeddings.retrievalContent, params.query, lang);
  const matchSql = textMatchSql(lessonEvidenceEmbeddings.retrievalContent, params.query, lang);

  const [vectorRows, textRows] = await Promise.all([
    getDb()
      .select({
        id: lessonEvidenceEmbeddings.id,
        content: lessonEvidenceEmbeddings.rawContent,
        retrievalContent: lessonEvidenceEmbeddings.retrievalContent,
        metadata: lessonEvidenceEmbeddings.metadata,
        sourceType: lessonEvidenceEmbeddings.sourceType,
        sourceId: lessonEvidenceEmbeddings.sourceId,
        score: scoreSql,
      })
      .from(lessonEvidenceEmbeddings)
      .where(
        and(
          eq(lessonEvidenceEmbeddings.classroomStudentId, params.classroomStudentId),
          sql`${lessonEvidenceEmbeddings.embedding} IS NOT NULL`,
        ),
      )
      .orderBy(sql`${lessonEvidenceEmbeddings.embedding} <=> ${queryVector}::vector ASC`)
      .limit(limit * 6),
    getDb()
      .select({
        id: lessonEvidenceEmbeddings.id,
        content: lessonEvidenceEmbeddings.rawContent,
        retrievalContent: lessonEvidenceEmbeddings.retrievalContent,
        metadata: lessonEvidenceEmbeddings.metadata,
        sourceType: lessonEvidenceEmbeddings.sourceType,
        sourceId: lessonEvidenceEmbeddings.sourceId,
        score: rankSql,
      })
      .from(lessonEvidenceEmbeddings)
      .where(
        and(
          eq(lessonEvidenceEmbeddings.classroomStudentId, params.classroomStudentId),
          eq(lessonEvidenceEmbeddings.language, params.language ?? "en"),
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
    feature: "lesson-evidence-search",
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

