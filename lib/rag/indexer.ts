import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { documentEmbeddings } from "@/db/schema/vectors";
import {
  chunkText,
  countTokens,
  DEFAULT_CHUNKING_VERSION,
  EMBEDDING_MODEL_NAME,
  EMBEDDING_VERSION,
  generateEmbeddings,
} from "./embeddings";
import { buildRetrievalContent, hashContent } from "@/lib/retrieval/metadata";

type SourceType = "response" | "insight" | "analytics" | "document";

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
  const chunks = chunkText(params.content, { maxTokens: 300, overlap: 40 });
  if (chunks.length === 0) return [];
  const retrievalChunks = chunks.map((chunk) =>
    buildRetrievalContent({
      headerEntries: [
        { label: "Source type", value: params.sourceType },
        { label: "Document title", value: params.documentTitle },
        { label: "Language", value: params.language },
        { label: "Session type", value: params.sessionType },
      ],
      rawContent: chunk,
    }),
  );

  const embeddings = await generateEmbeddings(retrievalChunks, {
    surveyId: params.surveyId,
  });

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
        chunks.map((content, index) => ({
          id: nanoid(),
          surveyId: params.surveyId,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          chunkIndex: index,
          language: params.language ?? null,
          sessionType: params.sessionType ?? null,
          documentTitle: params.documentTitle ?? null,
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
