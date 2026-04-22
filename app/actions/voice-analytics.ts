"use server";

import { desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys } from "@/db/schema/surveys";
import { voiceQualityMetrics, voiceSessions } from "@/db/schema/voice";
import { getVerifiedSession } from "@/lib/auth/session";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type VoiceAnalyticsSessionRow = {
  id: string;
  surveyId: string | null;
  startedAt: Date;
  durationMs: number | null;
  status: string | null;
};

export type VoiceAnalyticsMetricsOverview = {
  avgLatency: number;
  totalDuration: number;
  fallbackCount: number;
  sessionCount: number;
};

export async function getVoiceAnalyticsData(): Promise<
  ActionResult<{
    sessions: VoiceAnalyticsSessionRow[];
    metricsOverview: VoiceAnalyticsMetricsOverview;
  }>
> {
  try {
    const session = await getVerifiedSession();
    const db = getDb();

    const ownedVoiceSurveys = await db
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.userId, session.user.id));

    const surveyIds = ownedVoiceSurveys.map((survey) => survey.id);

    if (surveyIds.length === 0) {
      return {
        success: true,
        data: {
          sessions: [],
          metricsOverview: {
            avgLatency: 0,
            totalDuration: 0,
            fallbackCount: 0,
            sessionCount: 0,
          },
        },
      };
    }

    const sessions = await db
      .select({
        id: voiceSessions.id,
        surveyId: voiceSessions.surveyId,
        startedAt: voiceSessions.startedAt,
        durationMs: voiceSessions.durationMs,
        status: voiceSessions.status,
      })
      .from(voiceSessions)
      .where(inArray(voiceSessions.surveyId, surveyIds))
      .orderBy(desc(voiceSessions.startedAt))
      .limit(50);

    const sessionIds = sessions.map((voiceSession) => voiceSession.id);
    const metrics =
      sessionIds.length > 0
        ? await db
            .select({
              metricType: voiceQualityMetrics.metricType,
              metricValue: voiceQualityMetrics.metricValue,
              sessionId: voiceQualityMetrics.sessionId,
            })
            .from(voiceQualityMetrics)
            .where(inArray(voiceQualityMetrics.sessionId, sessionIds))
        : [];

    let totalLatency = 0;
    let latencyCount = 0;
    let fallbackCount = 0;

    for (const metric of metrics) {
      if (metric.metricType === "latency_ms") {
        totalLatency += Number.parseInt(metric.metricValue, 10) || 0;
        latencyCount += 1;
      }
      if (metric.metricType === "fallback_triggered") {
        fallbackCount += 1;
      }
    }

    return {
      success: true,
      data: {
        sessions,
        metricsOverview: {
          avgLatency: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
          totalDuration: sessions.reduce(
            (sum, voiceSession) => sum + (voiceSession.durationMs || 0),
            0,
          ),
          fallbackCount,
          sessionCount: sessions.length,
        },
      },
    };
  } catch (error) {
    console.error("[voice-analytics] failed to fetch voice analytics", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch analytics",
    };
  }
}
