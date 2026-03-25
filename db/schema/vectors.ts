import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  vector,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
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
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (table) => [
    index("document_embeddings_survey_id_idx").on(table.surveyId),
    index("document_embeddings_source_idx").on(
      table.sourceType,
      table.sourceId,
    ),
    index("document_embeddings_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
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
