/**
 * Performance Monitor
 *
 * Aggregates system-wide learning metrics into a snapshot used for:
 *  - Dashboard charting
 *  - Alert detection (discomfort spikes, pattern starvation)
 *  - Weekly reports
 */

import { db } from "@/db";
import { knowledgeBase } from "@/db/schema/vectors";
import {
  conversationSignals,
  conversationMoves,
  participantFeedback,
  experiments,
} from "@/db/schema/learning";
import { eq, sql, avg, count, and, gte } from "drizzle-orm";
import { countPatternsByStatus } from "./knowledge-storage";

export interface AgentPerformanceSnapshot {
  capturedAt: string;

  // Conversation health (7-day rolling)
  avgCompletionRate7d: number;
  avgObjectiveCoverage7d: number;
  avgResponseRichness7d: number;
  conversationsProcessed7d: number;

  // Participant sentiment
  avgParticipantRating: number | null; // 1-5, null if no data
  discomfortReportRate: number; // fraction of conversations with discomfort flag

  // Pattern ecosystem
  patternsByStatus: Record<string, number>;
  activePatterns: number;
  candidatePatterns: number;

  // Experiments
  activeExperiments: number;
  concludedExperiments30d: number;

  // Move-level quality
  avgMoveRichness7d: number;
  abandonmentLeadRate7d: number; // fraction of moves that led to abandonment

  // Alerts
  alerts: string[];
}

const DISCOMFORT_ALERT_THRESHOLD = 0.05; // 5%
const MIN_COMPLETION_ALERT = 0.4;        // below 40% mean issue
const MIN_ACTIVE_PATTERNS_ALERT = 3;     // warn if < 3 ACTIVE patterns

/**
 * Build a fresh performance snapshot.
 * Designed to be called by a weekly job or on-demand by the monitoring dashboard.
 */
export async function buildPerformanceSnapshot(): Promise<AgentPerformanceSnapshot> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // ── Conversation signals (7-day) ────────────────────────────────────────────
  const [signalStats] = await db
    .select({
      avgCompletion: avg(conversationSignals.completionRate),
      avgCoverage: avg(conversationSignals.objectiveCoverageScore),
      avgRichness: avg(conversationSignals.avgResponseRichnessScore),
      total: count(),
    })
    .from(conversationSignals)
    .where(gte(conversationSignals.createdAt, sevenDaysAgo));

  // ── Participant feedback ─────────────────────────────────────────────────────
  const [feedbackStats] = await db
    .select({
      avgRating: avg(participantFeedback.rating),
      total: count(),
      discomfortCount: sql<number>`SUM(CASE WHEN uncomfortable_topics THEN 1 ELSE 0 END)::int`,
    })
    .from(participantFeedback)
    .where(gte(participantFeedback.createdAt, sevenDaysAgo));

  // ── Move-level stats (7-day) ────────────────────────────────────────────────
  const [moveStats] = await db
    .select({
      avgRichness: avg(conversationMoves.responseRichnessScore),
      total: count(),
      abandonCount: sql<number>`SUM(CASE WHEN led_to_abandonment THEN 1 ELSE 0 END)::int`,
    })
    .from(conversationMoves)
    .where(gte(conversationMoves.createdAt, sevenDaysAgo));

  // ── Pattern statuses ────────────────────────────────────────────────────────
  const patternsByStatus = await countPatternsByStatus();

  // ── Experiments ─────────────────────────────────────────────────────────────
  const [expStats] = await db
    .select({ active: count() })
    .from(experiments)
    .where(eq(experiments.status, "active"));

  const [concludedStats] = await db
    .select({ concluded: count() })
    .from(experiments)
    .where(
      and(
        eq(experiments.status, "concluded"),
        gte(experiments.concludedAt!, thirtyDaysAgo)
      )
    );

  // ── Computed values ──────────────────────────────────────────────────────────
  const avgCompletionRate7d = Number(signalStats?.avgCompletion) || 0;
  const avgObjectiveCoverage7d = Number(signalStats?.avgCoverage) || 0;
  const avgResponseRichness7d = Number(signalStats?.avgRichness) || 0;
  const conversationsProcessed7d = Number(signalStats?.total) || 0;

  const avgParticipantRating = feedbackStats?.avgRating ? Number(feedbackStats.avgRating) : null;
  const totalFeedback = Number(feedbackStats?.total) || 0;
  const discomfortCount = Number(feedbackStats?.discomfortCount) || 0;
  const discomfortReportRate = totalFeedback > 0 ? discomfortCount / totalFeedback : 0;

  const avgMoveRichness7d = Number(moveStats?.avgRichness) || 0;
  const totalMoves = Number(moveStats?.total) || 0;
  const abandonmentLeadRate7d = totalMoves > 0
    ? (Number(moveStats?.abandonCount) || 0) / totalMoves
    : 0;

  const activePatterns = patternsByStatus["ACTIVE"] || 0;
  const candidatePatterns = patternsByStatus["CANDIDATE"] || 0;

  // ── Alert generation ─────────────────────────────────────────────────────────
  const alerts: string[] = [];

  if (discomfortReportRate > DISCOMFORT_ALERT_THRESHOLD && conversationsProcessed7d > 10) {
    alerts.push(
      `🚨 HIGH DISCOMFORT: ${(discomfortReportRate * 100).toFixed(1)}% of participants reported uncomfortable topics (threshold: ${DISCOMFORT_ALERT_THRESHOLD * 100}%)`
    );
  }

  if (avgCompletionRate7d < MIN_COMPLETION_ALERT && conversationsProcessed7d > 20) {
    alerts.push(
      `⚠️ LOW COMPLETION: 7-day avg completion rate is ${(avgCompletionRate7d * 100).toFixed(0)}% (threshold: ${MIN_COMPLETION_ALERT * 100}%)`
    );
  }

  if (activePatterns < MIN_ACTIVE_PATTERNS_ALERT) {
    alerts.push(
      `⚠️ PATTERN STARVATION: Only ${activePatterns} ACTIVE pattern(s). Agent is relying on fallback retrieval. ${candidatePatterns} candidates in queue.`
    );
  }

  const snapshot: AgentPerformanceSnapshot = {
    capturedAt: new Date().toISOString(),
    avgCompletionRate7d,
    avgObjectiveCoverage7d,
    avgResponseRichness7d,
    conversationsProcessed7d,
    avgParticipantRating,
    discomfortReportRate,
    patternsByStatus,
    activePatterns,
    candidatePatterns,
    activeExperiments: Number(expStats?.active) || 0,
    concludedExperiments30d: Number(concludedStats?.concluded) || 0,
    avgMoveRichness7d,
    abandonmentLeadRate7d,
    alerts,
  };

  if (alerts.length > 0) {
    console.warn("[PerformanceMonitor] Alerts detected:", alerts);
  }

  return snapshot;
}
