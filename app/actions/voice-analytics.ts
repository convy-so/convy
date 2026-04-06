"use server";

import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import { voiceSessions, voiceQualityMetrics } from "@/db/schema/voice";
import { surveys } from "@/db/schema/surveys";
import { eq, desc, inArray } from "drizzle-orm";
import { isWorkspaceOwner } from "@/lib/workspace-access";
import { ActionResult } from "./workspace";

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

export async function getVoiceAnalyticsData(): Promise<ActionResult<{
  sessions: VoiceAnalyticsSessionRow[];
  metricsOverview: VoiceAnalyticsMetricsOverview;
}>> {
  try {
    const session = await getVerifiedSession();
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      return { success: false, error: "No active workspace selected" };
    }

    const isOwner = await isWorkspaceOwner(session.user.id, organizationId);
    if (!isOwner) {
      return { success: false, error: "Unauthorized: Owner access required" };
    }

    const db = getDb();
    
    // First figure out the surveys
    const workspaceSurveys = await db
        .select({ id: surveys.id })
        .from(surveys)
        .where(eq(surveys.organizationId, organizationId));
        
    const surveyIds = workspaceSurveys.map(s => s.id);

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
            }
        };
    }

    // Fetch the recent sessions across all these surveys
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

    const sessionIds = sessions.map(s => s.id);

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

    // Calculate overviews (simple aggregation for the dashboard)
    let totalLatency = 0;
    let latencyCount = 0;
    let fallbackCount = 0;

    metrics.forEach(m => {
        if (m.metricType === 'latency_ms') {
            totalLatency += parseInt(m.metricValue, 10) || 0;
            latencyCount++;
        }
        if (m.metricType === 'fallback_triggered') fallbackCount++;
    });

    const metricsOverview = {
        avgLatency: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
        totalDuration: sessions.reduce((acc, curr) => acc + (curr.durationMs || 0), 0),
        fallbackCount,
        sessionCount: sessions.length
    };

    return {
      success: true,
      data: {
        sessions,
        metricsOverview
      }
    };
  } catch (error) {
    console.error("Error fetching voice analytics data:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch analytics",
    };
  }
}
