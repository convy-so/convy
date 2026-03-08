/**
 * Pattern Lifecycle Manager
 *
 * Runs nightly to:
 * 1. Promote CANDIDATE → SHADOW patterns that have enough evidence
 * 2. Promote SHADOW → IN_EXPERIMENT by creating A/B experiments
 * 3. Re-evaluate ACTIVE patterns for performance degradation → DEPRECATED
 */

import { getDb } from "@/db";
import { knowledgeBase } from "@/db/schema/vectors";
import { experiments } from "@/db/schema/learning";
import { eq, sql, and, lt, isNull, not } from "drizzle-orm";
import { nanoid } from "nanoid";

// Promotion thresholds
const CANDIDATE_MIN_CONVERSATIONS = 10; // conversations pattern has been seen in
const CANDIDATE_MIN_QUALITY = 0.5; // performanceScore threshold
const SHADOW_MIN_CONVERSATIONS = 30; // before going to A/B test
const ACTIVE_DEGRADATION_THRESHOLD = 0.3; // if ACTIVE pattern drops below this → DEPRECATED

export interface LifecycleReport {
  candidatesToShadow: number;
  shadowToExperiment: number;
  deprecatedActive: number;
  totalEvaluated: number;
}

// ---------------------------------------------------------------------------
// Main nightly job
// ---------------------------------------------------------------------------
export async function runLifecycleEvaluator(): Promise<LifecycleReport> {
  let candidatesToShadow = 0;
  let shadowToExperiment = 0;
  let deprecatedActive = 0;

  // ── Step 1: Promote CANDIDATE → SHADOW ────────────────────────────────────
  const candidates = await getDb()
    .select({
      id: knowledgeBase.id,
      title: knowledgeBase.title,
      performanceScore: knowledgeBase.performanceScore,
      usageCount: knowledgeBase.usageCount,
    })
    .from(knowledgeBase)
    .where(
      and(
        eq(knowledgeBase.status, "CANDIDATE"),
        sql`${knowledgeBase.usageCount} >= ${CANDIDATE_MIN_CONVERSATIONS}`,
        sql`COALESCE(${knowledgeBase.performanceScore}, 0) >= ${CANDIDATE_MIN_QUALITY}`,
      ),
    );

  for (const candidate of candidates) {
    await getDb()
      .update(knowledgeBase)
      .set({ status: "SHADOW" })
      .where(eq(knowledgeBase.id, candidate.id));
    console.log(
      `[Lifecycle] CANDIDATE→SHADOW: "${candidate.title}" (score=${candidate.performanceScore?.toFixed(2)})`,
    );
    candidatesToShadow++;
  }

  // ── Step 2: Promote SHADOW → IN_EXPERIMENT ────────────────────────────────
  const shadowPatterns = await getDb()
    .select({
      id: knowledgeBase.id,
      title: knowledgeBase.title,
      effectivePhase: knowledgeBase.effectivePhase,
      effectiveStyle: knowledgeBase.effectiveStyle,
      effectiveObstacle: knowledgeBase.effectiveObstacle,
      usageCount: knowledgeBase.usageCount,
    })
    .from(knowledgeBase)
    .where(
      and(
        eq(knowledgeBase.status, "SHADOW"),
        sql`${knowledgeBase.usageCount} >= ${SHADOW_MIN_CONVERSATIONS}`,
      ),
    );

  for (const shadow of shadowPatterns) {
    // Find an ACTIVE incumbent in the same situation to compete against
    const [incumbent] = await getDb()
      .select({ id: knowledgeBase.id })
      .from(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.status, "ACTIVE"),
          shadow.effectivePhase
            ? eq(knowledgeBase.effectivePhase, shadow.effectivePhase)
            : isNull(knowledgeBase.effectivePhase),
          shadow.effectiveStyle
            ? eq(knowledgeBase.effectiveStyle, shadow.effectiveStyle)
            : isNull(knowledgeBase.effectiveStyle),
        ),
      )
      .limit(1);

    if (!incumbent) {
      // No incumbent — fast-track to ACTIVE (no one to compete against)
      await getDb()
        .update(knowledgeBase)
        .set({
          status: "ACTIVE",
          promotedAt: new Date(),
        })
        .where(eq(knowledgeBase.id, shadow.id));
      console.log(
        `[Lifecycle] SHADOW→ACTIVE (no incumbent): "${shadow.title}"`,
      );
      shadowToExperiment++; // counted as advancement
      continue;
    }

    // Check no live experiment already exists for this situation
    const [existingExperiment] = await getDb()
      .select({ id: experiments.id })
      .from(experiments)
      .where(
        and(
          eq(experiments.status, "active"),
          eq(experiments.variantPatternId, shadow.id),
        ),
      )
      .limit(1);

    if (existingExperiment) continue; // already in an experiment

    // Create the experiment
    await getDb()
      .insert(experiments)
      .values({
        id: nanoid(),
        name: `${shadow.title} vs. incumbent`,
        status: "active",
        effectivePhase: shadow.effectivePhase,
        effectiveStyle: shadow.effectiveStyle,
        effectiveObstacle: null,
        controlPatternId: incumbent.id,
        variantPatternId: shadow.id,
        trafficSplit: 0.5,
        minSampleSize: 30,
      });

    await getDb()
      .update(knowledgeBase)
      .set({ status: "IN_EXPERIMENT" })
      .where(eq(knowledgeBase.id, shadow.id));

    console.log(`[Lifecycle] SHADOW→IN_EXPERIMENT: "${shadow.title}"`);
    shadowToExperiment++;
  }

  // ── Step 3: Re-evaluate ACTIVE patterns ───────────────────────────────────
  const activePatterns = await getDb()
    .select({
      id: knowledgeBase.id,
      title: knowledgeBase.title,
      performanceScore: knowledgeBase.performanceScore,
    })
    .from(knowledgeBase)
    .where(
      and(
        eq(knowledgeBase.status, "ACTIVE"),
        not(isNull(knowledgeBase.performanceScore)),
        lt(knowledgeBase.performanceScore!, ACTIVE_DEGRADATION_THRESHOLD),
      ),
    );

  for (const active of activePatterns) {
    await getDb()
      .update(knowledgeBase)
      .set({ status: "DEPRECATED" })
      .where(eq(knowledgeBase.id, active.id));
    console.log(
      `[Lifecycle] ACTIVE→DEPRECATED: "${active.title}" (score=${active.performanceScore?.toFixed(2)})`,
    );
    deprecatedActive++;
  }

  const report: LifecycleReport = {
    candidatesToShadow,
    shadowToExperiment,
    deprecatedActive,
    totalEvaluated:
      candidates.length + shadowPatterns.length + activePatterns.length,
  };

  console.log(`[Lifecycle] Nightly run complete:`, report);
  return report;
}

/**
 * Update the performanceScore of an ACTIVE pattern based on recent move data.
 * Called from the experiment evaluator after new move data is accumulated.
 */
export async function refreshPatternPerformanceScore(
  patternId: string,
): Promise<void> {
  // We look at moves tagged with this technique
  // and compute the ratio of high-richness responses
  const result = await getDb().execute(
    sql`
      SELECT
        AVG(response_richness_score)::float AS avg_richness,
        COUNT(*)::int AS move_count
      FROM conversation_moves
      WHERE technique_id = ${patternId}
        AND created_at > NOW() - INTERVAL '30 days'
    `,
  );
  const stats = result.rows[0] as
    | { avg_richness: number; move_count: number }
    | undefined;

  if (!stats || stats.move_count < 5) return; // Not enough recent data

  const newScore = Math.min(1, Math.max(0, stats.avg_richness));

  await getDb()
    .update(knowledgeBase)
    .set({ performanceScore: newScore })
    .where(eq(knowledgeBase.id, patternId));

  console.log(
    `[Lifecycle] Updated performanceScore for ${patternId}: ${newScore.toFixed(3)} (n=${stats.move_count})`,
  );
}
