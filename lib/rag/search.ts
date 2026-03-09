import { getDb } from "@/db";
import { documentEmbeddings, knowledgeBase } from "@/db/schema/vectors";
import { generateEmbedding } from "./embeddings";
import { and, desc, eq, gt, sql, inArray } from "drizzle-orm";
import { SupportedLanguage } from "../translation-service";

export interface SearchFilters {
  surveyId?: string;
  sourceType?: (
    | "response"
    | "insight"
    | "analytics"
    | "knowledge"
    | "document"
  )[];
  minDate?: Date;
  domainId?: number;
  minQualityScore?: number;
  limit?: number;
  language?: SupportedLanguage;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
  sourceType: string;
  sourceId?: string;
  createdAt: Date;
}

export async function vectorSearch(
  query: string,
  filters: SearchFilters = {},
): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query);
  const limit = filters.limit || 20;

  // Search document embeddings
  const docResults = await getDb()
    .select({
      id: documentEmbeddings.id,
      content: documentEmbeddings.content,
      metadata: documentEmbeddings.metadata,
      sourceType: documentEmbeddings.sourceType,
      sourceId: documentEmbeddings.sourceId,
      createdAt: documentEmbeddings.createdAt,
      // 1 - (embedding <=> query_embedding) is cosine similarity for normalized vectors
      // But pgvector's <=> operator is cosine distance.
      // Similarity = 1 - distance.
      similarity: sql<number>`1 - (${documentEmbeddings.embedding} <=> ${JSON.stringify(embedding)})`,
    })
    .from(documentEmbeddings)
    .where(
      and(
        filters.surveyId
          ? eq(documentEmbeddings.surveyId, filters.surveyId)
          : undefined,
        filters.sourceType
          ? inArray(documentEmbeddings.sourceType, filters.sourceType)
          : undefined,
        filters.minDate
          ? gt(documentEmbeddings.createdAt, filters.minDate)
          : undefined,
        // Only valid embeddings
        sql`${documentEmbeddings.embedding} IS NOT NULL`,
        filters.language
          ? sql`${documentEmbeddings.metadata}->>'language' = ${filters.language}`
          : undefined,
      ),
    )
    .orderBy(
      sql`1 - (${documentEmbeddings.embedding} <=> ${JSON.stringify(embedding)}) DESC`,
    )
    .limit(limit);

  // Search knowledge base if relevant (no surveyId usually, or globally relevant)
  let kbResults: any[] = [];
  if (!filters.surveyId || filters.sourceType?.includes("knowledge")) {
    kbResults = await getDb()
      .select({
        id: knowledgeBase.id,
        content: knowledgeBase.content,
        metadata: knowledgeBase.metadata,
        sourceType: sql<string>`'knowledge'`, // Normalize source type
        sourceId: knowledgeBase.id, // Use ID as sourceId
        createdAt: knowledgeBase.createdAt,
        similarity: sql<number>`1 - (${knowledgeBase.embedding} <=> ${JSON.stringify(embedding)})`,
      })
      .from(knowledgeBase)
      .where(
        and(
          filters.domainId
            ? eq(knowledgeBase.domainId, filters.domainId)
            : undefined,
          filters.minQualityScore
            ? gt(knowledgeBase.qualityScore, filters.minQualityScore)
            : undefined,
          // Only surface validated patterns at inference time
          sql`${knowledgeBase.status} IN ('ACTIVE', 'SHADOW')`,
          filters.language
            ? sql`${knowledgeBase.metadata}->>'language' = ${filters.language}`
            : undefined,
        ),
      )
      .orderBy(
        sql`1 - (${knowledgeBase.embedding} <=> ${JSON.stringify(embedding)}) DESC`,
      )
      .limit(limit);
  }

  // Combine and sort
  const allResults = [...docResults, ...kbResults]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return allResults.map((r) => ({
    id: r.id,
    content: r.content,
    score: r.similarity,
    metadata: r.metadata as Record<string, unknown>,
    sourceType: r.sourceType,
    sourceId: r.sourceId || undefined,
    createdAt: r.createdAt,
  }));
}

export async function fullTextSearch(
  query: string,
  filters: SearchFilters = {},
  language: SupportedLanguage = "en",
): Promise<SearchResult[]> {
  const limit = filters.limit || 20;

  // Map supported languages to Postgres tsconfig
  const langConfigMap: Record<SupportedLanguage, string> = {
    en: "english",
    fr: "french",
    de: "german",
    es: "spanish",
    it: "italian",
  };

  const tsConfig = langConfigMap[language] || "english";
  const tsQuery = sql`websearch_to_tsquery(${tsConfig}, ${query})`;

  const docRank = sql<number>`ts_rank(to_tsvector(${tsConfig}, ${documentEmbeddings.content}), ${tsQuery})`;

  const docResults = await getDb()
    .select({
      id: documentEmbeddings.id,
      content: documentEmbeddings.content,
      metadata: documentEmbeddings.metadata,
      sourceType: documentEmbeddings.sourceType,
      sourceId: documentEmbeddings.sourceId,
      createdAt: documentEmbeddings.createdAt,
      rank: docRank,
    })
    .from(documentEmbeddings)
    .where(
      and(
        filters.surveyId
          ? eq(documentEmbeddings.surveyId, filters.surveyId)
          : undefined,
        filters.sourceType
          ? inArray(documentEmbeddings.sourceType, filters.sourceType)
          : undefined,
        filters.minDate
          ? gt(documentEmbeddings.createdAt, filters.minDate)
          : undefined,
        sql`to_tsvector(${tsConfig}, ${documentEmbeddings.content}) @@ ${tsQuery}`,
        filters.language || language
          ? sql`${documentEmbeddings.metadata}->>'language' = ${filters.language || language}`
          : undefined,
      ),
    )
    .orderBy(desc(docRank))
    .limit(limit);

  // Knowledge base FTS
  let kbResults: any[] = [];
  if (!filters.surveyId || filters.sourceType?.includes("knowledge")) {
    const kbRank = sql<number>`ts_rank(to_tsvector(${tsConfig}, ${knowledgeBase.content}), ${tsQuery})`;

    kbResults = await getDb()
      .select({
        id: knowledgeBase.id,
        content: knowledgeBase.content,
        metadata: knowledgeBase.metadata,
        sourceType: sql<string>`'knowledge'`,
        sourceId: knowledgeBase.id,
        createdAt: knowledgeBase.createdAt,
        rank: kbRank,
      })
      .from(knowledgeBase)
      .where(
        and(
          filters.domainId
            ? eq(knowledgeBase.domainId, filters.domainId)
            : undefined,
          filters.minQualityScore
            ? gt(knowledgeBase.qualityScore, filters.minQualityScore)
            : undefined,
          // Only surface validated patterns at inference time
          sql`${knowledgeBase.status} IN ('ACTIVE', 'SHADOW')`,
          filters.language || language
            ? sql`${knowledgeBase.metadata}->>'language' = ${filters.language || language}`
            : undefined,
        ),
      )
      .orderBy(desc(kbRank))
      .limit(limit);
  }

  const allResults = [...docResults, ...kbResults]
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);

  return allResults.map((r) => ({
    id: r.id,
    content: r.content,
    score: r.rank,
    metadata: r.metadata as Record<string, unknown>,
    sourceType: r.sourceType,
    sourceId: r.sourceId || undefined,
    createdAt: r.createdAt,
  }));
}

export async function hybridSearch(
  query: string,
  filters: SearchFilters = {},
  language: SupportedLanguage = "en",
): Promise<SearchResult[]> {
  const limit = filters.limit || 20;

  const [vectorResults, textResults] = await Promise.all([
    vectorSearch(query, {
      ...filters,
      limit: limit * 2,
      language: filters.language || language,
    }), // Fetch more for better fusion
    fullTextSearch(
      query,
      { ...filters, limit: limit * 2 },
      filters.language || language,
    ),
  ]);

  // Reciprocal Rank Fusion (RRF)
  const k = 60; // Constant for RRF
  const scores = new Map<string, number>();
  const resultsMap = new Map<string, SearchResult>();

  // Process vector results
  vectorResults.forEach((result, index) => {
    scores.set(result.id, (scores.get(result.id) || 0) + 1 / (k + index + 1));
    resultsMap.set(result.id, result);
  });

  // Process text results
  textResults.forEach((result, index) => {
    scores.set(result.id, (scores.get(result.id) || 0) + 1 / (k + index + 1));
    if (!resultsMap.has(result.id)) {
      resultsMap.set(result.id, result);
    }
  });

  // Sort by aggregated score
  const fusedResults = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => {
      const result = resultsMap.get(id)!;
      return {
        ...result,
        score: score, // RRF score
      };
    });

  return fusedResults;
}

/**
 * High-level helper for searching the knowledge base specifically.
 * Used by agents to find domain-specific information.
 */
export async function searchKnowledgeBase(
  query: string,
  limit: number = 3,
  domainId?: number,
  language: SupportedLanguage = "en",
): Promise<SearchResult[]> {
  return hybridSearch(
    query,
    {
      limit,
      domainId,
      sourceType: ["knowledge"],
    },
    language,
  );
}
