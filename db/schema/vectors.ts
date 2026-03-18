import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
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
      enum: ["response", "insight", "analytics", "knowledge", "document"],
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

export const knowledgeBase = pgTable(
  "knowledge_base",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    domainId: integer("domain_id"),
    category: text("category", {
      enum: ["technique", "pattern", "insight", "feedback", "general"],
    }).notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    qualityScore: integer("quality_score").default(0), // 0-100 (kept for compat)
    usageCount: integer("usage_count").default(0),
    source: text("source").default("system"), // 'system', 'feedback', 'user'
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("knowledge_base_domain_idx").on(table.domainId),
    index("knowledge_base_category_idx").on(table.category),
    index("knowledge_base_embedding_idx").using(
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
