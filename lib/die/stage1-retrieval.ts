import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import type { SubDomain } from "@/lib/agents/skill-system/types";

/**
 * Embed a single text string using text-embedding-3-small.
 * Returns a 1536-dimension float array.
 */
export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: text,
  });
  return embedding;
}

/**
 * Build the composite text for a domain — this is what gets embedded.
 * Name + description + all semantic examples.
 */
export function buildDomainCompositeText(domain: SubDomain): string {
  return [
    `Domain: ${domain.name}`,
    `Description: ${domain.description}`,
    `Example research intents:`,
    ...domain.semanticExamples.map((e) => `- ${e}`),
  ].join("\n");
}

/**
 * DIE Stage 1: Retrieve top N candidate domains by cosine similarity
 * using pgvector HNSW index on the domain_embeddings table.
 *
 * @param intentStatement  The user's raw research intent text
 * @param topN             Number of candidates to return (default 5)
 * @param threshold        Minimum similarity score (default 0.35, fallback 0.25)
 */
export async function retrieveCandidateDomains(
  intentStatement: string,
  topN: number = 5,
  threshold: number = 0.35,
): Promise<{ domainId: string; domainName: string; familyId: number; similarity: number }[]> {
  // 1. Embed the user intent
  const queryEmbedding = await embedText(intentStatement);
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  // 2. pgvector cosine similarity search using HNSW index
  const db = getDb();
  const result = await db.execute(sql`
    SELECT
      domain_id,
      domain_name,
      family_id,
      1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
    FROM domain_embeddings
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingLiteral}::vector
    LIMIT ${topN * 2}
  `);

  const rows = result.rows as Array<{
    domain_id: string;
    domain_name: string;
    family_id: number;
    similarity: number;
  }>;

  // 3. Filter by threshold
  let filtered = rows.filter((r) => r.similarity >= threshold);

  // 4. Fallback: if fewer than 3 pass threshold, lower to 0.25
  if (filtered.length < 3 && threshold > 0.25) {
    filtered = rows.filter((r) => r.similarity >= 0.25);
  }

  return filtered.slice(0, topN).map((r) => ({
    domainId: r.domain_id,
    domainName: r.domain_name,
    familyId: Number(r.family_id),
    similarity: Number(r.similarity),
  }));
}
