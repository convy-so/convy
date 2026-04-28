import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { documentEmbeddings } from "@/db/schema/vectors";
import {
  STANDARD_MODEL,
  EMBEDDING_VERSION,
  DEFAULT_CHUNKING_VERSION,
  prepareEmbeddingsForIndexing,
} from "./core";

type SourceType = "response" | "insight" | "analytics" | "document";

/**
 * Replaces all stored embedding chunks for a survey document source.
 *
 * Idempotent: deletes existing chunks for (surveyId, sourceType, sourceId)
 * then re-inserts fresh ones. Safe to call on every content update.
 */
export async function replaceEmbeddedSource(params: {
  surveyId: string;
  sourceType: SourceType;
  sourceId: string;
  content: string;
  language?: string | null;
  sessionType?: "sample" | "live" | null;
  documentTitle?: string | null;
  sourceUpdatedAt?: Date | null;
  metadata?: Record<string, unknown>;
}) {
  const chunks = await prepareEmbeddingsForIndexing({
    content: params.content,
    chunkOptions: { maxTokens: 300 },
    headerEntries: [
      { label: "Source type", value: params.sourceType },
      { label: "Document title", value: params.documentTitle },
      { label: "Language", value: params.language },
      { label: "Session type", value: params.sessionType },
    ],
    attribution: { surveyId: params.surveyId },
  });

  if (chunks.length === 0) return [];

  return await getDb().transaction(async (tx) => {
    await tx
      .delete(documentEmbeddings)
      .where(
        and(
          eq(documentEmbeddings.surveyId, params.surveyId),
          eq(documentEmbeddings.sourceType, params.sourceType),
          eq(documentEmbeddings.sourceId, params.sourceId),
        ),
      );

    return await tx
      .insert(documentEmbeddings)
      .values(
        chunks.map((chunk) => ({
          id: nanoid(),
          surveyId: params.surveyId,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          chunkIndex: chunk.chunkIndex,
          language: params.language ?? null,
          sessionType: params.sessionType ?? null,
          documentTitle: params.documentTitle ?? null,
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
