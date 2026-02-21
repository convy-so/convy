/**
 * Context Engine
 *
 * Retrieves the right pattern for the right moment during a conversation.
 *
 * Retrieval priority:
 *  1. Live A/B experiment — if this situation has an active experiment, return the assigned variant
 *  2. Exact situational match — ACTIVE pattern for (phase, style, obstacle)
 *  3. Phase-only match — ACTIVE patterns for this phase, any style
 *  4. Vector fallback — hybrid search across ACTIVE knowledge base
 */

import { db } from "@/db";
import { knowledgeBase } from "@/db/schema/vectors";
import { eq, and, sql, isNull, desc } from "drizzle-orm";
import { searchKnowledgeBase } from "@/lib/rag/search";
import { findActiveExperiment, assignVariant } from "./experiment-engine";

export interface SituationKey {
  phase?: "opening" | "exploration" | "deepdive" | "closing";
  style?: "verbose" | "concise" | "hesitant" | "neutral";
  obstacle?: string;
}

export interface RetrievedPattern {
  id: string;
  title: string;
  content: string;
  source: "experiment" | "situational" | "vector";
  status: string;
  performanceScore: number | null;
  experimentVariant?: "control" | "variant";
  experimentId?: string;
}

/**
 * Retrieve the best pattern for a given situation.
 * Agents call this at the start of each conversation turn to get guidance.
 */
export async function retrievePatternForSituation(
  situation: SituationKey,
  query: string,
  conversationId: string,
  domainId?: number | null
): Promise<RetrievedPattern | null> {
  // ── Step 1: Check for live A/B experiment ──────────────────────────────────
  const experiment = await findActiveExperiment(situation);

  if (experiment) {
    const variant = assignVariant(conversationId, experiment.id, experiment.trafficSplit);
    const patternId = variant === "variant"
      ? experiment.variantPatternId
      : experiment.controlPatternId;

    if (patternId) {
      const [pattern] = await db
        .select({
          id: knowledgeBase.id,
          title: knowledgeBase.title,
          content: knowledgeBase.content,
          status: knowledgeBase.status,
          performanceScore: knowledgeBase.performanceScore,
        })
        .from(knowledgeBase)
        .where(eq(knowledgeBase.id, patternId))
        .limit(1);

      if (pattern) {
        return {
          ...pattern,
          status: pattern.status ?? "ACTIVE",
          source: "experiment",
          experimentVariant: variant,
          experimentId: experiment.id,
        };
      }
    }
  }

  // ── Step 2: Exact situational match (ACTIVE patterns) ─────────────────────
  if (situation.phase || situation.style) {
    const exactMatch = await findExactSituationalPattern(situation, domainId);
    if (exactMatch) return { ...exactMatch, source: "situational" };
  }

  // ── Step 3: Phase-only match ───────────────────────────────────────────────
  if (situation.phase) {
    const phaseMatch = await findPhasePattern(situation.phase, domainId);
    if (phaseMatch) return { ...phaseMatch, source: "situational" };
  }

  // ── Step 4: Vector fallback across ACTIVE knowledge base ──────────────────
  const vectorResults = await searchKnowledgeBase(query, 1, domainId ?? undefined);
  if (vectorResults.length > 0) {
    const top = vectorResults[0];
    return {
      id: top.id,
      title: top.content.split("\n")[0].replace("PATTERN: ", ""),
      content: top.content,
      status: "ACTIVE",
      performanceScore: null,
      source: "vector",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function findExactSituationalPattern(
  situation: SituationKey,
  domainId?: number | null
): Promise<Omit<RetrievedPattern, "source"> | null> {
  const [row] = await db
    .select({
      id: knowledgeBase.id,
      title: knowledgeBase.title,
      content: knowledgeBase.content,
      status: knowledgeBase.status,
      performanceScore: knowledgeBase.performanceScore,
    })
    .from(knowledgeBase)
    .where(
      and(
        eq(knowledgeBase.status, "ACTIVE"),
        situation.phase
          ? eq(knowledgeBase.effectivePhase, situation.phase)
          : isNull(knowledgeBase.effectivePhase),
        situation.style
          ? eq(knowledgeBase.effectiveStyle, situation.style)
          : isNull(knowledgeBase.effectiveStyle),
        domainId != null
          ? eq(knowledgeBase.domainId, domainId)
          : isNull(knowledgeBase.domainId)
      )
    )
    .orderBy(desc(knowledgeBase.performanceScore))
    .limit(1);

  return row ? { ...row, status: row.status ?? "ACTIVE" } : null;
}

async function findPhasePattern(
  phase: "opening" | "exploration" | "deepdive" | "closing",
  domainId?: number | null
): Promise<Omit<RetrievedPattern, "source"> | null> {
  const [row] = await db
    .select({
      id: knowledgeBase.id,
      title: knowledgeBase.title,
      content: knowledgeBase.content,
      status: knowledgeBase.status,
      performanceScore: knowledgeBase.performanceScore,
    })
    .from(knowledgeBase)
    .where(
      and(
        eq(knowledgeBase.status, "ACTIVE"),
        eq(knowledgeBase.effectivePhase, phase),
        domainId != null
          ? eq(knowledgeBase.domainId, domainId)
          : sql`${knowledgeBase.domainId} IS NULL OR ${knowledgeBase.domainId} = ${domainId}`
      )
    )
    .orderBy(desc(knowledgeBase.performanceScore))
    .limit(1);

  return row ? { ...row, status: row.status ?? "ACTIVE" } : null;
}
