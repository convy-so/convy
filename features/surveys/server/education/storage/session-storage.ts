import { and, asc, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import {
  surveyEvidence,
  surveySessionInsights,
  surveySessions,
  surveyTurns,
} from "@/shared/db/schema";
import { requireValue } from "@/shared/utils/collections";
import type {
  ConversationInsight,
  EvidenceRecord,
  SessionState,
  SessionType,
} from "../types";

export async function ensureSession(params: {
  surveyId: string;
  sessionType: SessionType;
  sourceConversationId: string;
  language: string;
  respondentId?: string | null;
  respondentRole?: string | null;
  initialState: SessionState;
}) {
  const [existing] = await getDb()
    .select()
    .from(surveySessions)
    .where(eq(surveySessions.sourceConversationId, params.sourceConversationId));

  if (existing) return existing;

  const [created] = await getDb()
    .insert(surveySessions)
    .values({
      id: params.initialState.sessionId,
      surveyId: params.surveyId,
      sessionType: params.sessionType,
      sourceConversationId: params.sourceConversationId,
      language: params.language,
      respondentId: params.respondentId ?? null,
      respondentRole: params.respondentRole ?? null,
      sessionStatus: params.initialState.status,
      sessionState: params.initialState,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return requireValue(
    created,
    `Failed to create survey session for conversation ${params.sourceConversationId}`,
  );
}

export async function getSessionBySourceId(sourceConversationId: string) {
  const [session] = await getDb()
    .select()
    .from(surveySessions)
    .where(eq(surveySessions.sourceConversationId, sourceConversationId));
  return session ?? null;
}

export async function getSessionById(sessionId: string) {
  const [session] = await getDb()
    .select()
    .from(surveySessions)
    .where(eq(surveySessions.id, sessionId));
  return session ?? null;
}

export async function listSurveySessionsByType(
  surveyId: string,
  sessionType: SessionType,
) {
  return await getDb()
    .select({
      id: surveySessions.id,
      surveyId: surveySessions.surveyId,
      sessionType: surveySessions.sessionType,
      sessionStatus: surveySessions.sessionStatus,
      sourceConversationId: surveySessions.sourceConversationId,
      language: surveySessions.language,
      respondentId: surveySessions.respondentId,
      respondentRole: surveySessions.respondentRole,
      sessionState: surveySessions.sessionState,
      summary: surveySessions.summary,
      completedAt: surveySessions.completedAt,
      createdAt: surveySessions.createdAt,
      updatedAt: surveySessions.updatedAt,
    })
    .from(surveySessions)
    .where(
      and(
        eq(surveySessions.surveyId, surveyId),
        eq(surveySessions.sessionType, sessionType),
      ),
    )
    .orderBy(desc(surveySessions.updatedAt));
}

export async function updateSessionState(sessionId: string, state: SessionState) {
  const [updated] = await getDb()
    .update(surveySessions)
    .set({
      sessionState: state,
      sessionStatus: state.status,
      completedAt: state.status === "completed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(surveySessions.id, sessionId))
    .returning();
  return requireValue(
    updated,
    `Failed to update survey session state for session ${sessionId}`,
  );
}

export async function replaceSessionTurns(params: {
  surveyId: string;
  sessionId: string;
  turns: Array<{
    id?: string;
    role: string;
    content: string;
    sourceMessageId?: string;
    metadata?: Record<string, unknown>;
  }>;
}) {
  await getDb().delete(surveyTurns).where(eq(surveyTurns.sessionId, params.sessionId));
  if (params.turns.length === 0) return [];

  const inserted = await getDb()
    .insert(surveyTurns)
    .values(
      params.turns.map((turn, index) => ({
        id: turn.id ?? nanoid(),
        surveyId: params.surveyId,
        sessionId: params.sessionId,
        turnIndex: index + 1,
        role: turn.role,
        content: turn.content,
        sourceMessageId: turn.sourceMessageId,
        metadata: turn.metadata ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    )
    .returning();
  return inserted;
}

export async function listSessionTurns(sessionId: string) {
  return await getDb()
    .select()
    .from(surveyTurns)
    .where(eq(surveyTurns.sessionId, sessionId))
    .orderBy(asc(surveyTurns.turnIndex));
}

export async function replaceEvidence(
  sessionId: string,
  surveyId: string,
  evidence: EvidenceRecord[],
) {
  await getDb().delete(surveyEvidence).where(eq(surveyEvidence.sessionId, sessionId));
  if (evidence.length === 0) return [];

  return await getDb()
    .insert(surveyEvidence)
    .values(
      evidence.map((item) => ({
        id: item.id,
        surveyId,
        sessionId,
        turnId: item.turnId,
        nodeId: item.nodeId,
        evidenceType: item.evidenceType,
        excerpt: item.excerpt,
        sentiment: item.sentiment,
        reliability: item.reliability,
        metadata: item,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    )
    .returning();
}

export async function listEvidenceForSurvey(surveyId: string) {
  return await getDb()
    .select()
    .from(surveyEvidence)
    .where(eq(surveyEvidence.surveyId, surveyId));
}

export async function listEvidenceForSurveyByType(
  surveyId: string,
  sessionType: SessionType,
) {
  return await getDb()
    .select({
      id: surveyEvidence.id,
      createdAt: surveyEvidence.createdAt,
      updatedAt: surveyEvidence.updatedAt,
      surveyId: surveyEvidence.surveyId,
      sessionId: surveyEvidence.sessionId,
      turnId: surveyEvidence.turnId,
      nodeId: surveyEvidence.nodeId,
      evidenceType: surveyEvidence.evidenceType,
      excerpt: surveyEvidence.excerpt,
      sentiment: surveyEvidence.sentiment,
      reliability: surveyEvidence.reliability,
      metadata: surveyEvidence.metadata,
    })
    .from(surveyEvidence)
    .innerJoin(surveySessions, eq(surveySessions.id, surveyEvidence.sessionId))
    .where(
      and(
        eq(surveyEvidence.surveyId, surveyId),
        eq(surveySessions.sessionType, sessionType),
      ),
    );
}

export async function listEvidenceForSession(sessionId: string) {
  return await getDb()
    .select()
    .from(surveyEvidence)
    .where(eq(surveyEvidence.sessionId, sessionId));
}

export async function upsertSessionInsight(
  surveyId: string,
  sessionId: string,
  insight: ConversationInsight,
) {
  const [existing] = await getDb()
    .select()
    .from(surveySessionInsights)
    .where(eq(surveySessionInsights.sessionId, sessionId));

  if (existing) {
    const [updated] = await getDb()
      .update(surveySessionInsights)
      .set({ insight, updatedAt: new Date() })
      .where(eq(surveySessionInsights.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await getDb()
    .insert(surveySessionInsights)
    .values({
      id: nanoid(),
      surveyId,
      sessionId,
      insight,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function listSurveySessionInsights(surveyId: string) {
  return await getDb()
    .select()
    .from(surveySessionInsights)
    .where(eq(surveySessionInsights.surveyId, surveyId));
}

export async function listSurveySessionInsightsByType(
  surveyId: string,
  sessionType: SessionType,
) {
  return await getDb()
    .select({
      id: surveySessionInsights.id,
      surveyId: surveySessionInsights.surveyId,
      sessionId: surveySessionInsights.sessionId,
      insight: surveySessionInsights.insight,
      createdAt: surveySessionInsights.createdAt,
      updatedAt: surveySessionInsights.updatedAt,
    })
    .from(surveySessionInsights)
    .innerJoin(surveySessions, eq(surveySessions.id, surveySessionInsights.sessionId))
    .where(
      and(
        eq(surveySessionInsights.surveyId, surveyId),
        eq(surveySessions.sessionType, sessionType),
      ),
    );
}

export async function countLiveSessions(surveyId: string) {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(surveySessions)
    .where(
      and(
        eq(surveySessions.surveyId, surveyId),
        eq(surveySessions.sessionType, "live"),
      ),
    );
  return Number(row?.count ?? 0);
}
