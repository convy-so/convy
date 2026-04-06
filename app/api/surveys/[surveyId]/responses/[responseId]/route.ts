import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import {
  surveyCoveragePlans,
  surveyEvidence,
  surveySessionInsights,
  surveySessions,
  surveyTurns,
  surveys,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import type { AnalyticsSessionDetail } from "@/lib/analytics";
import type {
  ConversationInsight,
  CoverageNode,
  EvidenceRecord,
} from "@/lib/education/types";
import {
  conversationInsightSchema,
  evidenceRecordSchema,
} from "@/lib/education/types";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string; responseId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId, responseId } = await params;

    const [survey] = await getDb()
      .select({
        id: surveys.id,
        title: surveys.title,
        userId: surveys.userId,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canView")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [sessionRow] = await getDb()
      .select()
      .from(surveySessions)
      .where(
        and(
          eq(surveySessions.surveyId, surveyId),
          or(
            eq(surveySessions.id, responseId),
            eq(surveySessions.sourceConversationId, responseId),
          ),
        ),
      );

    if (!sessionRow) {
      return NextResponse.json({ error: "Response not found" }, { status: 404 });
    }

    const [insightRow, turnRows, evidenceRows, activePlan] = await Promise.all([
      getDb()
        .select()
        .from(surveySessionInsights)
        .where(eq(surveySessionInsights.sessionId, sessionRow.id))
        .then((rows) => rows[0]),
      getDb()
        .select()
        .from(surveyTurns)
        .where(eq(surveyTurns.sessionId, sessionRow.id)),
      getDb()
        .select()
        .from(surveyEvidence)
        .where(eq(surveyEvidence.sessionId, sessionRow.id)),
      getDb()
        .select()
        .from(surveyCoveragePlans)
        .where(
          and(
            eq(surveyCoveragePlans.surveyId, surveyId),
            eq(surveyCoveragePlans.isActive, true),
          ),
        )
        .then((rows) => rows[0]),
    ]);

    const insightResult = conversationInsightSchema.safeParse(insightRow?.insight);
    const insight: ConversationInsight | undefined = insightResult.success
      ? insightResult.data
      : undefined;
    const nodeCoverageMap = sessionRow.sessionState.coverageByNode || {};
    const planNodes = activePlan?.plan.nodes || [];
    const evidence = evidenceRows
      .map((row) => evidenceRecordSchema.safeParse(row.metadata))
      .filter((result): result is { success: true; data: EvidenceRecord } => result.success)
      .map((result) => result.data);

    const payload: AnalyticsSessionDetail = {
      id: sessionRow.id,
      surveyId: survey.id,
      surveyTitle: survey.title,
      sessionType: sessionRow.sessionType,
      sourceConversationId: sessionRow.sourceConversationId,
      startedAt: sessionRow.createdAt.toISOString(),
      completedAt: sessionRow.completedAt?.toISOString() ?? null,
      status: sessionRow.sessionStatus,
      summary:
        insight?.summary ||
        sessionRow.summary ||
        "No session summary is available yet.",
      keyFindings: Array.isArray(insight?.keyFindings) ? insight.keyFindings : [],
      risks: Array.isArray(insight?.risks) ? insight.risks : [],
      reliabilityPercent: Math.round(
        (sessionRow.sessionState.reliabilityScore || 0) * 100,
      ),
      completenessPercent: Math.round(
        (sessionRow.sessionState.overallCoverage || 0) * 100,
      ),
      fatiguePercent: Math.round(
        (sessionRow.sessionState.fatigueScore || 0) * 100,
      ),
      nodeCoverage: planNodes.map((node: CoverageNode) => ({
        id: node.id,
        label: node.label,
        description: node.description,
        coveragePercent: Math.round((nodeCoverageMap[node.id] || 0) * 100),
      })),
      notableQuotes: Array.isArray(insight?.notableQuotes) ? insight.notableQuotes : [],
      evidence,
      transcript: turnRows
        .sort((a, b) => a.turnIndex - b.turnIndex)
        .map((turn) => ({
          id: turn.id,
          role: turn.role,
          content: turn.content,
        })),
    };

    return NextResponse.json(payload);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED")
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[Response Details API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch response details" },
      { status: 500 },
    );
  }
}
