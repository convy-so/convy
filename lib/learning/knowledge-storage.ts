/**
 * Knowledge Storage System
 *
 * Stores extracted patterns in the knowledge base with:
 * - CANDIDATE status (patterns must earn their way to ACTIVE)
 * - Signal-backed performanceScore (not LLM opinion)
 * - Vector deduplication (existing logic kept)
 */

import { ingestKnowledge, type KnowledgeEntry } from "@/lib/rag/ingest";
import { generateEmbedding } from "@/lib/rag/embeddings";
import type { ExtractedPattern } from "./pattern-extraction";
import { getDb } from "@/db";
import { knowledgeBase } from "@/db/schema/vectors";
import { eq, and, sql, desc } from "drizzle-orm";

const MIN_QUALITY_SCORE = 40;
const SIMILARITY_THRESHOLD = 0.85;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store extracted patterns in the knowledge base.
 * All new patterns start as CANDIDATE — they are not used in production
 * until the lifecycle evaluator promotes them.
 */
export async function storePatterns(
  patterns: ExtractedPattern[],
): Promise<{ stored: number; skipped: number; updated: number }> {
  let stored = 0;
  let skipped = 0;
  let updated = 0;

  for (const pattern of patterns) {
    if (pattern.qualityScore < MIN_QUALITY_SCORE) {
      skipped++;
      continue;
    }

    const similarPattern = await findSimilarPattern(pattern);

    if (similarPattern) {
      if (pattern.qualityScore > similarPattern.qualityScore) {
        await updatePattern(similarPattern.id, pattern);
        updated++;
      } else {
        await incrementPatternUsage(similarPattern.id);
        skipped++;
      }
    } else {
      await storeNewPattern(pattern);
      stored++;
    }
  }

  return { stored, skipped, updated };
}

/**
 * Count patterns grouped by lifecycle status (for monitoring).
 */
export async function countPatternsByStatus(): Promise<Record<string, number>> {
  const rows = await getDb()
    .select({
      status: knowledgeBase.status,
      count: sql<number>`count(*)::int`,
    })
    .from(knowledgeBase)
    .groupBy(knowledgeBase.status);

  const result: Record<string, number> = {};
  for (const row of rows) {
    if (row.status) result[row.status] = row.count;
  }
  return result;
}

/**
 * Retrieve relevant ACTIVE patterns for a domain and category.
 * Falls back to SHADOW patterns if not enough ACTIVE ones exist.
 */
export async function retrieveRelevantPatterns(
  domainId: number | null,
  category: ExtractedPattern["category"],
  limit: number = 5,
): Promise<Array<{ title: string; content: string; qualityScore: number }>> {
  const kbCategory = mapPatternCategoryToKnowledgeCategory(category);

  const patterns = await getDb()
    .select({
      title: knowledgeBase.title,
      content: knowledgeBase.content,
      qualityScore: knowledgeBase.qualityScore,
      performanceScore: knowledgeBase.performanceScore,
      status: knowledgeBase.status,
    })
    .from(knowledgeBase)
    .where(
      and(
        eq(knowledgeBase.category, kbCategory),
        domainId
          ? eq(knowledgeBase.domainId, domainId)
          : sql`${knowledgeBase.domainId} IS NULL`,
        sql`${knowledgeBase.status} IN ('ACTIVE', 'SHADOW')`,
        sql`${knowledgeBase.qualityScore} >= ${MIN_QUALITY_SCORE}`,
      ),
    )
    .orderBy(
      // Prefer signal-backed performanceScore, fall back to qualityScore
      sql`COALESCE(${knowledgeBase.performanceScore}, ${knowledgeBase.qualityScore}::real / 100) DESC`,
      desc(knowledgeBase.usageCount),
    )
    .limit(limit);

  return patterns.map((p) => ({
    ...p,
    qualityScore: p.qualityScore ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function findSimilarPattern(
  pattern: ExtractedPattern,
): Promise<{ id: string; qualityScore: number } | null> {
  const kbCategory = mapPatternCategoryToKnowledgeCategory(pattern.category);

  try {
    const searchContent = `${pattern.title}\n${pattern.description}`;
    const embedding = await generateEmbedding(searchContent, {
      surveyId: pattern.metadata.surveyId,
    });
    const embeddingString = JSON.stringify(embedding);

    const [existing] = await getDb()
      .select({
        id: knowledgeBase.id,
        qualityScore: knowledgeBase.qualityScore,
        similarity: sql<number>`1 - (${knowledgeBase.embedding} <=> ${embeddingString})`,
      })
      .from(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.category, kbCategory),
          pattern.domainId
            ? eq(knowledgeBase.domainId, pattern.domainId)
            : sql`${knowledgeBase.domainId} IS NULL`,
          sql`${knowledgeBase.embedding} IS NOT NULL`,
          sql`1 - (${knowledgeBase.embedding} <=> ${embeddingString}) > ${SIMILARITY_THRESHOLD}`,
        ),
      )
      .orderBy(
        desc(sql`1 - (${knowledgeBase.embedding} <=> ${embeddingString})`),
      )
      .limit(1);

    return existing
      ? { ...existing, qualityScore: existing.qualityScore ?? 0 }
      : null;
  } catch {
    const [fallback] = await getDb()
      .select({
        id: knowledgeBase.id,
        qualityScore: knowledgeBase.qualityScore,
      })
      .from(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.category, kbCategory),
          pattern.domainId
            ? eq(knowledgeBase.domainId, pattern.domainId)
            : sql`${knowledgeBase.domainId} IS NULL`,
          sql`LOWER(${knowledgeBase.title}) = LOWER(${pattern.title})`,
        ),
      )
      .limit(1);

    return fallback
      ? { ...fallback, qualityScore: fallback.qualityScore ?? 0 }
      : null;
  }
}

async function storeNewPattern(pattern: ExtractedPattern): Promise<void> {
  const content = formatPatternContent(pattern);
  const kbCategory =
    pattern.type === "anti-pattern"
      ? "feedback"
      : mapPatternCategoryToKnowledgeCategory(pattern.category);

  // performanceScore: normalised 0-1 version of qualityScore as the initial estimate
  const initialPerformanceScore = pattern.qualityScore / 100;

  const entry: KnowledgeEntry = {
    domainId: pattern.domainId ?? undefined,
    category: kbCategory,
    title: pattern.title,
    content,
    source: "feedback",
    metadata: {
      ...pattern.metadata,
      patternCategory: pattern.category,
      example: pattern.example,
      context: pattern.context,
      successIndicators: pattern.successIndicators,
      qualityScore: pattern.qualityScore,
      effectivePhase: pattern.effectivePhase,
      effectiveStyle: pattern.effectiveStyle,
      createdAt: new Date().toISOString(),
    },
  };

  // ingestKnowledge handles embedding + insert
  await ingestKnowledge(entry);

  // Now set the lifecycle-specific fields that ingestKnowledge doesn't know about.
  // We update the row we just inserted (find by title + source + recent creation).
  await getDb()
    .update(knowledgeBase)
    .set({
      status: "CANDIDATE",
      performanceScore: initialPerformanceScore,
      effectivePhase: pattern.effectivePhase ?? null,
      effectiveStyle: pattern.effectiveStyle ?? null,
    })
    .where(
      and(
        sql`LOWER(${knowledgeBase.title}) = LOWER(${pattern.title})`,
        eq(knowledgeBase.source, "feedback"),
        // Only update if status is still the default (avoid overwriting a promoted pattern)
        eq(knowledgeBase.status, "CANDIDATE"),
      ),
    );
}

async function updatePattern(
  patternId: string,
  newPattern: ExtractedPattern,
): Promise<void> {
  const content = formatPatternContent(newPattern);
  const newPerformanceScore = newPattern.qualityScore / 100;

  await getDb()
    .update(knowledgeBase)
    .set({
      title: newPattern.title,
      content,
      qualityScore: newPattern.qualityScore,
      performanceScore: newPerformanceScore,
      effectivePhase: newPattern.effectivePhase ?? null,
      effectiveStyle: newPattern.effectiveStyle ?? null,
      metadata: {
        ...newPattern.metadata,
        category: newPattern.category,
        example: newPattern.example,
        context: newPattern.context,
        successIndicators: newPattern.successIndicators,
        updatedAt: new Date().toISOString(),
      },
    })
    .where(eq(knowledgeBase.id, patternId));
}

async function incrementPatternUsage(patternId: string): Promise<void> {
  const [pattern] = await getDb()
    .select({ usageCount: knowledgeBase.usageCount })
    .from(knowledgeBase)
    .where(eq(knowledgeBase.id, patternId))
    .limit(1);

  if (pattern) {
    await getDb()
      .update(knowledgeBase)
      .set({ usageCount: (pattern.usageCount || 0) + 1 })
      .where(eq(knowledgeBase.id, patternId));
  }
}

function mapPatternCategoryToKnowledgeCategory(
  patternCategory: ExtractedPattern["category"],
): "technique" | "pattern" | "insight" | "feedback" | "general" {
  switch (patternCategory) {
    case "questioning":
    case "probing":
    case "transition":
    case "engagement":
      return "technique";
    case "creation":
      return "pattern";
    case "general":
      return "general";
    default:
      return "pattern";
  }
}

function formatPatternContent(pattern: ExtractedPattern): string {
  return `PATTERN: ${pattern.title}

DESCRIPTION:
${pattern.description}

CONTEXT:
${pattern.context}

EXAMPLE FROM CONVERSATION:
"${pattern.example}"

SUCCESS INDICATORS:
${pattern.successIndicators.map((i) => `- ${i}`).join("\n")}

QUALITY SCORE: ${pattern.qualityScore}/100
CONVERSATION TYPE: ${pattern.metadata.conversationType}
COMPLETION RATE: ${(pattern.metadata.completionRate * 100).toFixed(0)}%
OBJECTIVE COVERAGE: ${(pattern.metadata.objectiveCoverageScore * 100).toFixed(0)}%
AVG RICHNESS: ${((pattern.metadata.avgResponseRichnessScore as number) * 100).toFixed(0)}%
${pattern.effectivePhase ? `EFFECTIVE PHASE: ${pattern.effectivePhase}` : ""}
${pattern.effectiveStyle ? `EFFECTIVE STYLE: ${pattern.effectiveStyle}` : ""}`.trim();
}
