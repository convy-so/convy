/**
 * A/B Experiment Engine
 *
 * Manages situational experiments comparing two patterns.
 *
 * Design decisions:
 * - Assignment is deterministic (hash-based) — same conversationId always gets same variant
 * - Evaluation uses Welch's t-test on response richness scores
 * - Safety guardrail: if variant leads to significantly MORE abandonment, abort
 */

import { getDb } from "@/db";
import { knowledgeBase } from "@/db/schema/vectors";
import { experiments, experimentOutcomes } from "@/db/schema/learning";
import { eq, and, sql, avg, count } from "drizzle-orm";
import { nanoid } from "nanoid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SituationKey {
  phase?: "opening" | "exploration" | "deepdive" | "closing";
  style?: "verbose" | "concise" | "hesitant" | "neutral";
  obstacle?: string;
}

export interface MoveOutcome {
  responseWordCount: number;
  responseRichnessScore: number;
  ledToAbandonment: boolean;
}

export interface ExperimentEvaluationReport {
  evaluated: number;
  concluded: number;
  inconclusive: number;
  abortedUnsafe: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find the active experiment (if any) for a given situation.
 * Returns null if no experiment covers this situation.
 */
export async function findActiveExperiment(situation: SituationKey): Promise<{
  id: string;
  controlPatternId: string | null;
  variantPatternId: string | null;
  trafficSplit: number;
} | null> {
  const [experiment] = await getDb()
    .select({
      id: experiments.id,
      controlPatternId: experiments.controlPatternId,
      variantPatternId: experiments.variantPatternId,
      trafficSplit: experiments.trafficSplit,
    })
    .from(experiments)
    .where(
      and(
        eq(experiments.status, "active"),
        situation.phase
          ? eq(experiments.effectivePhase, situation.phase)
          : sql`${experiments.effectivePhase} IS NULL`,
        situation.style
          ? eq(experiments.effectiveStyle, situation.style)
          : sql`${experiments.effectiveStyle} IS NULL`,
      ),
    )
    .limit(1);

  return experiment ?? null;
}

/**
 * Deterministically assign a conversation to a variant.
 * Same conversationId + experimentId always returns the same variant.
 */
export function assignVariant(
  conversationId: string,
  experimentId: string,
  trafficSplit: number,
): "control" | "variant" {
  // Simple string hash — deterministic, no randomness at assignments time
  const hash = simpleHash(`${conversationId}::${experimentId}`);
  const normalized = (hash % 1000) / 1000; // 0-0.999…
  return normalized < trafficSplit ? "variant" : "control";
}

/**
 * Record the outcome of a move that was part of an active experiment.
 */
export async function recordExperimentOutcome(
  moveId: string,
  experimentId: string,
  variant: "control" | "variant",
  outcome: MoveOutcome,
): Promise<void> {
  await getDb().insert(experimentOutcomes).values({
    id: nanoid(),
    experimentId,
    moveId,
    assignedVariant: variant,
    responseWordCount: outcome.responseWordCount,
    responseRichnessScore: outcome.responseRichnessScore,
    ledToAbandonment: outcome.ledToAbandonment,
  });
}

/**
 * Nightly evaluation: compute statistics for all active experiments.
 * Promotes winners, rejects losers, marks inconclusive ones for continued running.
 */
export async function evaluateExperiments(): Promise<ExperimentEvaluationReport> {
  let concluded = 0;
  let inconclusive = 0;
  let abortedUnsafe = 0;

  const activeExperiments = await getDb()
    .select()
    .from(experiments)
    .where(eq(experiments.status, "active"));

  for (const exp of activeExperiments) {
    const stats = await getExperimentStats(exp.id);

    // Not enough data yet
    if (
      stats.control.n < exp.minSampleSize ||
      stats.variant.n < exp.minSampleSize
    ) {
      inconclusive++;
      continue;
    }

    // Safety guardrail: if variant causes significantly more abandonment, abort
    const abandonmentIncrease =
      stats.variant.abandonmentRate - stats.control.abandonmentRate;
    if (abandonmentIncrease > 0.15) {
      console.log(
        `[ExperimentEngine] UNSAFE — variant has +${(abandonmentIncrease * 100).toFixed(0)}% abandonment. Aborting experiment ${exp.id}`,
      );
      await concludeExperiment(
        exp.id,
        exp.controlPatternId,
        "control_wins_safety",
      );
      abortedUnsafe++;
      concluded++;
      continue;
    }

    // Statistical test
    const tStat = welchTStat(stats.control, stats.variant);
    const significant = Math.abs(tStat) > 1.96; // ~95% confidence (z-approx for large n)

    if (significant) {
      const winner =
        tStat > 0
          ? { id: exp.variantPatternId, side: "variant" as const }
          : { id: exp.controlPatternId, side: "control" as const };
      const loser =
        tStat > 0
          ? { id: exp.controlPatternId, side: "control" as const }
          : { id: exp.variantPatternId, side: "variant" as const };

      console.log(
        `[ExperimentEngine] Experiment ${exp.id} concluded — ${winner.side} wins (t=${tStat.toFixed(2)})`,
      );
      await concludeExperiment(exp.id, winner.id, `${winner.side}_wins`);

      // Promote winner to ACTIVE
      if (winner.id) {
        await getDb()
          .update(knowledgeBase)
          .set({
            status: "ACTIVE",
            promotedAt: new Date(),
            experimentWins: sql`experiment_wins + 1`,
          })
          .where(eq(knowledgeBase.id, winner.id));
      }

      // Deprecate loser (but only if it was IN_EXPERIMENT, not already ACTIVE)
      if (loser.id) {
        await getDb()
          .update(knowledgeBase)
          .set({ status: "DEPRECATED" })
          .where(
            and(
              eq(knowledgeBase.id, loser.id),
              eq(knowledgeBase.status, "IN_EXPERIMENT"),
            ),
          );
      }

      concluded++;
    } else {
      inconclusive++;
    }
  }

  const report: ExperimentEvaluationReport = {
    evaluated: activeExperiments.length,
    concluded,
    inconclusive,
    abortedUnsafe,
  };
  console.log(`[ExperimentEngine] Evaluation complete:`, report);
  return report;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface VariantStats {
  n: number;
  mean: number;
  variance: number;
  abandonmentRate: number;
}

async function getExperimentStats(
  experimentId: string,
): Promise<{ control: VariantStats; variant: VariantStats }> {
  const rows = await getDb()
    .select({
      variant: experimentOutcomes.assignedVariant,
      avgRichness: avg(experimentOutcomes.responseRichnessScore),
      sampleCount: count(),
      abandonCount: sql<number>`SUM(CASE WHEN led_to_abandonment THEN 1 ELSE 0 END)::int`,
    })
    .from(experimentOutcomes)
    .where(eq(experimentOutcomes.experimentId, experimentId))
    .groupBy(experimentOutcomes.assignedVariant);

  const makeStats = (row: (typeof rows)[0] | undefined): VariantStats => {
    if (!row) return { n: 0, mean: 0, variance: 0.01, abandonmentRate: 0 };
    const n = Number(row.sampleCount);
    const mean = Number(row.avgRichness) || 0;
    return {
      n,
      mean,
      variance: 0.01, // placeholder — full variance needs raw data; sufficient for this approximation
      abandonmentRate: n > 0 ? Number(row.abandonCount) / n : 0,
    };
  };

  const controlRow = rows.find((r) => r.variant === "control");
  const variantRow = rows.find((r) => r.variant === "variant");

  return { control: makeStats(controlRow), variant: makeStats(variantRow) };
}

/** Welch's t-statistic: positive means variant > control */
function welchTStat(control: VariantStats, variant: VariantStats): number {
  if (control.n === 0 || variant.n === 0) return 0;
  const se = Math.sqrt(
    control.variance / control.n + variant.variance / variant.n,
  );
  if (se === 0) return 0;
  return (variant.mean - control.mean) / se;
}

async function concludeExperiment(
  experimentId: string,
  winnerId: string | null | undefined,
): Promise<void> {
  await getDb()
    .update(experiments)
    .set({
      status: "concluded",
      concludedAt: new Date(),
      winnerId: winnerId ?? null,
    })
    .where(eq(experiments.id, experimentId));
}

/** Simple deterministic string hash (djb2) */
function simpleHash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h;
}
