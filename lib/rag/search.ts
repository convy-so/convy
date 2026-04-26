import { getDb } from "@/db";
import { documentEmbeddings } from "@/db/schema/vectors";
import { generateEmbedding } from "./embeddings";
import { and, desc, eq, gt, sql, inArray } from "drizzle-orm";
import { SupportedLanguage } from "../translation-service";
import { generateText, Output } from "ai";
import { flashLiteModel } from "../ai";
import { z } from "zod";
import { rerank } from "./reranker";

export interface SearchFilters {
  surveyId?: string;
  sourceType?: (
    | "response"
    | "insight"
    | "analytics"
    | "document"
  )[];
  minDate?: Date;
  limit?: number;
  language?: SupportedLanguage;
  sessionType?: "sample" | "live";
}

export interface SearchResult {
  id: string;
  content: string;
  retrievalContent?: string;
  score: number;
  metadata: Record<string, unknown>;
  sourceType: string;
  sourceId?: string;
  createdAt: Date;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(Object.entries(value));
}


export async function vectorSearch(
  query: string,
  filters: SearchFilters = {},
): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query);
  const limit = filters.limit || 20;
  const queryVector = JSON.stringify(embedding);

  // Search document embeddings
  const docResults = await getDb()
    .select({
      id: documentEmbeddings.id,
      content: documentEmbeddings.rawContent,
      retrievalContent: documentEmbeddings.retrievalContent,
      metadata: documentEmbeddings.metadata,
      sourceType: documentEmbeddings.sourceType,
      sourceId: documentEmbeddings.sourceId,
      createdAt: documentEmbeddings.createdAt,
      similarity: sql<number>`1 - (${documentEmbeddings.embedding} <=> ${queryVector})`,
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
          ? eq(documentEmbeddings.language, filters.language)
          : undefined,
        filters.sessionType
          ? eq(documentEmbeddings.sessionType, filters.sessionType)
          : undefined,
      ),
    )
    .orderBy(sql`${documentEmbeddings.embedding} <=> ${queryVector} ASC`)
    .limit(limit);

  return docResults.map((r) => ({
    id: r.id,
    content: r.content,
    retrievalContent: r.retrievalContent,
    score: r.similarity,
    metadata: normalizeMetadata(r.metadata),
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
  const effectiveLanguage = filters.language ?? language;

  const langConfigMap: Record<SupportedLanguage, string> = {
    en: "english",
    fr: "french",
    de: "german",
  };

  const tsConfig = langConfigMap[effectiveLanguage] || "english";
  const tsQuery = sql`websearch_to_tsquery(${tsConfig}, ${query})`;

  const docRank = sql<number>`ts_rank(to_tsvector(${tsConfig}, ${documentEmbeddings.retrievalContent}), ${tsQuery})`;

  const docResults = await getDb()
    .select({
      id: documentEmbeddings.id,
      content: documentEmbeddings.rawContent,
      retrievalContent: documentEmbeddings.retrievalContent,
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
        sql`to_tsvector(${tsConfig}, ${documentEmbeddings.retrievalContent}) @@ ${tsQuery}`,
        effectiveLanguage
          ? eq(documentEmbeddings.language, effectiveLanguage)
          : undefined,
        filters.sessionType
          ? eq(documentEmbeddings.sessionType, filters.sessionType)
          : undefined,
      ),
    )
    .orderBy(desc(docRank))
    .limit(limit);

  return docResults.map((r) => ({
    id: r.id,
    content: r.content,
    retrievalContent: r.retrievalContent,
    score: r.rank,
    metadata: normalizeMetadata(r.metadata),
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
    }),
    fullTextSearch(
      query,
      { ...filters, limit: limit * 2 },
      filters.language || language,
    ),
  ]);

  const k = 60;
  const scores = new Map<string, number>();
  const resultsMap = new Map<string, SearchResult>();

  vectorResults.forEach((result, index) => {
    scores.set(result.id, (scores.get(result.id) || 0) + 1 / (k + index + 1));
    resultsMap.set(result.id, result);
  });

  textResults.forEach((result, index) => {
    scores.set(result.id, (scores.get(result.id) || 0) + 1 / (k + index + 1));
    if (!resultsMap.has(result.id)) {
      resultsMap.set(result.id, result);
    }
  });

  const fusedResults = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => {
      const result = resultsMap.get(id)!;
      return {
        ...result,
        score: score,
      };
    });

  return fusedResults;
}

export async function executeRAGQuery(
  rawQuery: string,
  filters: SearchFilters,
  language: SupportedLanguage = "en",
): Promise<SearchResult[]> {
  if (!filters.surveyId) {
    throw new Error("executeRAGQuery requires surveyId.");
  }
  
  const queriesToRun = [rawQuery];
  
  try {
    const { output: object } = await generateText({
      model: flashLiteModel,
      output: Output.object({
        schema: z.object({
          hydeAnswer: z.string().describe("Write a hypothetical first-person respondent answer to the query constraint."),
          variants: z.array(z.string()).describe("Write 3 semantically distinct variations or alternative vocabulary phrasings of the raw user query."),
        }),
      }),
      prompt: `Original Query: "${rawQuery}"\nLanguage: ${language}\nGenerate a hypothetical answer and query variants for better RAG retrieval.`,
    });
    
    if (object.hydeAnswer) queriesToRun.push(object.hydeAnswer);
    if (object.variants && object.variants.length > 0) {
      queriesToRun.push(...object.variants.slice(0, 3));
    }
  } catch {
  }

  const fetchLimit = filters.limit || 20;
  const k = 60;
  const scores = new Map<string, number>();
  const resultsMap = new Map<string, SearchResult>();

  await Promise.all(
    queriesToRun.map(async (q) => {
      const [vectorResults, textResults] = await Promise.all([
        vectorSearch(q, { ...filters, limit: fetchLimit * 2, language }),
        fullTextSearch(q, { ...filters, limit: fetchLimit * 2 }, language),
      ]);

      vectorResults.forEach((result, index) => {
        scores.set(result.id, (scores.get(result.id) || 0) + 1 / (k + index + 1));
        resultsMap.set(result.id, result);
      });

      textResults.forEach((result, index) => {
        scores.set(result.id, (scores.get(result.id) || 0) + 1 / (k + index + 1));
        if (!resultsMap.has(result.id)) {
          resultsMap.set(result.id, result);
        }
      });
    })
  );

  const candidatePool = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 150)
    .map(([id, score]) => {
      const result = resultsMap.get(id)!;
      return {
        ...result,
        content: result.retrievalContent ?? result.content,
        score,
      };
    });

  const finalContextLimit = fetchLimit;
  const reranked = await rerank(rawQuery, candidatePool, finalContextLimit);
  
  return reranked.map(r => {
    const rawAnswer = r.content;
    r.content = `[Source ID: ${r.id}] Context chunk:\n${rawAnswer}`;
    return r;
  });
}

