import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { documentEmbeddings } from "@/db/schema/vectors";
import { chunkText, generateEmbeddings } from "./embeddings";

type SourceType = "response" | "insight" | "analytics" | "document";

export async function replaceEmbeddedSource(params: {
  surveyId: string;
  sourceType: SourceType;
  sourceId: string;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  await getDb()
    .delete(documentEmbeddings)
    .where(
      and(
        eq(documentEmbeddings.surveyId, params.surveyId),
        eq(documentEmbeddings.sourceType, params.sourceType),
        eq(documentEmbeddings.sourceId, params.sourceId),
      ),
    );

  const chunks = chunkText(params.content, { maxTokens: 300, overlap: 40 });
  if (chunks.length === 0) return [];

  const embeddings = await generateEmbeddings(chunks, {
    surveyId: params.surveyId,
  });

  return await getDb()
    .insert(documentEmbeddings)
    .values(
      chunks.map((content, index) => ({
        id: nanoid(),
        surveyId: params.surveyId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
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
