import {
  index,
  text,
  timestamp,
  pgTable,
  vector,
  integer,
} from "drizzle-orm/pg-core";

/**
 * Domain embedding store — used by DIE Stage 1 for cosine similarity search.
 * Pre-built offline via scripts/build-domain-embeddings.ts.
 * Each row = one research domain (60 total).
 */
export const domainEmbeddings = pgTable(
  "domain_embeddings",
  {
    domainId: text("domain_id").primaryKey(),    // e.g. "be-residential-tenant"
    domainName: text("domain_name").notNull(),
    familyId: integer("family_id").notNull(),
    compositeText: text("composite_text").notNull(), // name + description + examples
    embedding: vector("embedding", { dimensions: 1536 }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("domain_embeddings_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);
