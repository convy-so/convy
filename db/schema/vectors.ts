import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { timestamps } from "./common";
import { surveys } from "./surveys";

export const documentEmbeddings = pgTable(
  "document_embeddings",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    sourceType: text("source_type", {
      enum: ["response", "insight", "analytics", "document"],
    }).notNull(),
    sourceId: text("source_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    language: text("language").default("en"),
    sessionType: text("session_type"),
    documentTitle: text("document_title"),
    embeddingModel: text("embedding_model"),
    embeddingVersion: text("embedding_version"),
    chunkingVersion: text("chunking_version"),
    contentHash: text("content_hash"),
    sourceUpdatedAt: timestamp("source_updated_at", {
      withTimezone: true,
      mode: "date",
    }),
    tokenCount: integer("token_count"),
    rawContent: text("raw_content").notNull().default(""),
    retrievalContent: text("retrieval_content").notNull().default(""),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    embedding: vector("embedding", { dimensions: 1024 }),
  },
  (table) => [
    index("document_embeddings_survey_id_idx").on(table.surveyId),
    index("document_embeddings_language_idx").on(table.language),
    index("document_embeddings_session_type_idx").on(table.sessionType),
    index("document_embeddings_source_idx").on(
      table.sourceType,
      table.sourceId,
    ),
    index("document_embeddings_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    uniqueIndex("document_embeddings_source_chunk_unique").on(
      table.surveyId,
      table.sourceType,
      table.sourceId,
      table.chunkIndex,
    ),
    index("document_embeddings_retrieval_en_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.retrievalContent})`,
    ),
    index("document_embeddings_retrieval_de_idx").using(
      "gin",
      sql`to_tsvector('german', ${table.retrievalContent})`,
    ),
    index("document_embeddings_retrieval_fr_idx").using(
      "gin",
      sql`to_tsvector('french', ${table.retrievalContent})`,
    ),
    index("document_embeddings_retrieval_es_idx").using(
      "gin",
      sql`to_tsvector('spanish', ${table.retrievalContent})`,
    ),
    index("document_embeddings_retrieval_it_idx").using(
      "gin",
      sql`to_tsvector('italian', ${table.retrievalContent})`,
    ),
  ],
);


export const documentEmbeddingsRelations = relations(
  documentEmbeddings,
  ({ one }) => ({
    survey: one(surveys, {
      fields: [documentEmbeddings.surveyId],
      references: [surveys.id],
    }),
  }),
);
