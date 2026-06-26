import { and, eq, or } from "drizzle-orm";

import { getDb } from "@/shared/db";
import {
  surveyCoveragePlans,
  surveyEvidence,
  surveySessionInsights,
  surveySessions,
  surveyTurns,
  surveys,
} from "@/shared/db/schema";
import type { AuthSessionWithUser } from "@/features/auth/public-server";
import type { AnalyticsSessionDetail } from "@/features/surveys/server/analytics/dashboard-analytics";
import type {
  ConversationInsight,
  CoverageNode,
  EvidenceRecord,
} from "@/features/surveys/server/education/types";
import {
  conversationInsightSchema,
  evidenceRecordSchema,
} from "@/features/surveys/server/education/types";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";

type SurveySession = Pick<AuthSessionWithUser, "user">;

export async function getSurveyResponseDetailViewModel(
  surveyId: string,
  responseId: string,
  session: SurveySession,
): Promise<AnalyticsSessionDetail> {
  const [survey] = await getDb()
    .select({
      id: surveys.id,
      title: surveys.title,
    })
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  if (!survey) {
    throw new Error("Survey not found");
  }

  const permission = await getSurveyPermissionForSession(session, surveyId);
  if (!hasSurveyPermission(permission, "canView")) {
    throw new Error("Unauthorized");
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
    throw new Error("Response not found");
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

  return {
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
}
