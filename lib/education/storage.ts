import { and, asc, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { documentEmbeddings } from "@/db/schema/vectors";
import {
  refinementMessages,
  refinementProposals,
  refinementThreads,
  sampleFeedbackEntries,
  sampleFeedbackPatches,
  researchBriefPatches,
  surveyConductingProfiles,
  surveyAnalyticsFacts,
  surveyAnalyticsSnapshots,
  surveyAnalyticsStates,
  surveyBriefs,
  surveyCoveragePlans,
  surveyEvidence,
  surveySessionInsights,
  surveySessions,
  surveyTurns,
  surveys,
} from "@/db/schema";
import type {
  AnalyticsFact,
  AnalyticsGenerationState,
  AnalyticsSnapshot,
  ConversationInsight,
  CoveragePlan,
  EvidenceRecord,
  ResearchBrief,
  SessionState,
  SessionType,
} from "./types";
import type {
  SampleConductingProfile,
  SampleFeedbackEntryInput,
  SampleFeedbackPatch,
} from "./sample-feedback";
import type {
  RefinementMessage,
  RefinementProposal,
  ResearchBriefPatch,
} from "./refinement";

export async function getSurveyById(surveyId: string) {
  const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
  return survey ?? null;
}

export async function getSurveyByShareableLink(shareableLink: string) {
  const [survey] = await getDb()
    .select()
    .from(surveys)
    .where(eq(surveys.shareableLink, shareableLink));
  return survey ?? null;
}

export async function upsertResearchBrief(params: {
  surveyId: string;
  programId: string;
  brief: ResearchBrief;
  completenessStatus: string;
  approvalState: string;
  missingFields: string[];
  validationNotes: string[];
}) {
  const [existing] = await getDb()
    .select()
    .from(surveyBriefs)
    .where(eq(surveyBriefs.surveyId, params.surveyId));

  const nextVersion = (existing?.version ?? 0) + 1;
  const payload = {
    programId: params.programId,
    brief: params.brief,
    completenessStatus: params.completenessStatus,
    approvalState: params.approvalState,
    missingFields: params.missingFields,
    validationNotes: params.validationNotes,
    version: nextVersion,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await getDb()
      .update(surveyBriefs)
      .set(payload)
      .where(eq(surveyBriefs.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await getDb()
    .insert(surveyBriefs)
    .values({
      id: nanoid(),
      surveyId: params.surveyId,
      createdAt: new Date(),
      ...payload,
    })
    .returning();
  return created;
}

export async function getResearchBrief(surveyId: string) {
  const [brief] = await getDb()
    .select()
    .from(surveyBriefs)
    .where(eq(surveyBriefs.surveyId, surveyId));
  return brief ?? null;
}

export async function replaceCoveragePlan(surveyId: string, plan: CoveragePlan) {
  await getDb()
    .update(surveyCoveragePlans)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(surveyCoveragePlans.surveyId, surveyId));

  const [created] = await getDb()
    .insert(surveyCoveragePlans)
    .values({
      id: nanoid(),
      surveyId,
      version: plan.version,
      plan,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function getActiveCoveragePlan(surveyId: string) {
  const [plan] = await getDb()
    .select()
    .from(surveyCoveragePlans)
    .where(and(eq(surveyCoveragePlans.surveyId, surveyId), eq(surveyCoveragePlans.isActive, true)))
    .orderBy(desc(surveyCoveragePlans.version));
  return plan ?? null;
}

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
  return created;
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
  return updated;
}

export async function replaceSessionTurns(params: {
  surveyId: string;
  sessionId: string;
  turns: Array<{ id?: string; role: string; content: string; sourceMessageId?: string; metadata?: Record<string, unknown> }>;
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

export async function replaceEvidence(sessionId: string, surveyId: string, evidence: EvidenceRecord[]) {
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

export async function upsertSessionInsight(surveyId: string, sessionId: string, insight: ConversationInsight) {
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

export async function replaceAnalyticsSnapshot(surveyId: string, snapshot: AnalyticsSnapshot) {
  await getDb()
    .update(surveyAnalyticsSnapshots)
    .set({ isLatest: false, updatedAt: new Date() })
    .where(eq(surveyAnalyticsSnapshots.surveyId, surveyId));

  const [created] = await getDb()
    .insert(surveyAnalyticsSnapshots)
    .values({
      id: nanoid(),
      surveyId,
      version: snapshot.version,
      snapshot,
      isLatest: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function getLatestAnalyticsSnapshot(surveyId: string) {
  const [snapshot] = await getDb()
    .select()
    .from(surveyAnalyticsSnapshots)
    .where(and(eq(surveyAnalyticsSnapshots.surveyId, surveyId), eq(surveyAnalyticsSnapshots.isLatest, true)))
    .orderBy(desc(surveyAnalyticsSnapshots.version));
  return snapshot ?? null;
}

export async function listAnalyticsSnapshots(surveyId: string) {
  return await getDb()
    .select()
    .from(surveyAnalyticsSnapshots)
    .where(eq(surveyAnalyticsSnapshots.surveyId, surveyId))
    .orderBy(desc(surveyAnalyticsSnapshots.version));
}

export async function getAnalyticsSnapshotByVersion(
  surveyId: string,
  version: number,
) {
  const [snapshot] = await getDb()
    .select()
    .from(surveyAnalyticsSnapshots)
    .where(
      and(
        eq(surveyAnalyticsSnapshots.surveyId, surveyId),
        eq(surveyAnalyticsSnapshots.version, version),
      ),
    )
    .limit(1);
  return snapshot ?? null;
}

export async function upsertAnalyticsState(
  surveyId: string,
  state: AnalyticsGenerationState,
) {
  const [existing] = await getDb()
    .select()
    .from(surveyAnalyticsStates)
    .where(eq(surveyAnalyticsStates.surveyId, surveyId))
    .limit(1);

  if (existing) {
    const [updated] = await getDb()
      .update(surveyAnalyticsStates)
      .set({ state, updatedAt: new Date() })
      .where(eq(surveyAnalyticsStates.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await getDb()
    .insert(surveyAnalyticsStates)
    .values({
      id: nanoid(),
      surveyId,
      state,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function getAnalyticsState(surveyId: string) {
  const [row] = await getDb()
    .select()
    .from(surveyAnalyticsStates)
    .where(eq(surveyAnalyticsStates.surveyId, surveyId))
    .limit(1);
  return row ?? null;
}

export async function replaceAnalyticsFacts(
  surveyId: string,
  sessionId: string,
  facts: AnalyticsFact[],
) {
  await getDb()
    .delete(surveyAnalyticsFacts)
    .where(eq(surveyAnalyticsFacts.sessionId, sessionId));

  if (facts.length === 0) return [];

  return await getDb()
    .insert(surveyAnalyticsFacts)
    .values(
      facts.map((fact) => ({
        id: fact.id,
        surveyId,
        sessionId,
        nodeId: fact.nodeId,
        fact,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    )
    .returning();
}

export async function listAnalyticsFactsForSurvey(surveyId: string) {
  return await getDb()
    .select()
    .from(surveyAnalyticsFacts)
    .where(eq(surveyAnalyticsFacts.surveyId, surveyId));
}

export async function listAnalyticsFactsForSurveyByType(
  surveyId: string,
  sessionType: SessionType,
) {
  return await getDb()
    .select({
      id: surveyAnalyticsFacts.id,
      createdAt: surveyAnalyticsFacts.createdAt,
      updatedAt: surveyAnalyticsFacts.updatedAt,
      surveyId: surveyAnalyticsFacts.surveyId,
      sessionId: surveyAnalyticsFacts.sessionId,
      nodeId: surveyAnalyticsFacts.nodeId,
      fact: surveyAnalyticsFacts.fact,
    })
    .from(surveyAnalyticsFacts)
    .innerJoin(surveySessions, eq(surveySessions.id, surveyAnalyticsFacts.sessionId))
    .where(
      and(
        eq(surveyAnalyticsFacts.surveyId, surveyId),
        eq(surveySessions.sessionType, sessionType),
      ),
    );
}

export async function purgeSessionAnalyticsArtifacts(params: {
  surveyId: string;
  sessionId: string;
}) {
  const evidenceRows = await getDb()
    .select({ id: surveyEvidence.id })
    .from(surveyEvidence)
    .where(eq(surveyEvidence.sessionId, params.sessionId));

  await Promise.all([
    getDb()
      .delete(surveySessionInsights)
      .where(eq(surveySessionInsights.sessionId, params.sessionId)),
    getDb()
      .delete(surveyAnalyticsFacts)
      .where(eq(surveyAnalyticsFacts.sessionId, params.sessionId)),
    getDb()
      .delete(documentEmbeddings)
      .where(
        and(
          eq(documentEmbeddings.surveyId, params.surveyId),
          eq(documentEmbeddings.sourceType, "insight"),
          eq(documentEmbeddings.sourceId, params.sessionId),
        ),
      ),
  ]);

  if (evidenceRows.length > 0) {
    await Promise.all(
      evidenceRows.map((row) =>
        getDb()
          .delete(documentEmbeddings)
          .where(
            and(
              eq(documentEmbeddings.surveyId, params.surveyId),
              eq(documentEmbeddings.sourceType, "response"),
              eq(documentEmbeddings.sourceId, row.id),
            ),
          ),
      ),
    );
  }
}

export async function countLiveSessions(surveyId: string) {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(surveySessions)
    .where(and(eq(surveySessions.surveyId, surveyId), eq(surveySessions.sessionType, "live")));
  return Number(row?.count ?? 0);
}

export async function createSampleFeedbackEntry(params: {
  surveyId: string;
  sampleConversationId: string | null;
  conversationNumber: number;
  createdBy: string;
  feedbackInput: SampleFeedbackEntryInput;
}) {
  const [created] = await getDb()
    .insert(sampleFeedbackEntries)
    .values({
      id: nanoid(),
      surveyId: params.surveyId,
      sampleConversationId: params.sampleConversationId,
      conversationNumber: params.conversationNumber,
      createdBy: params.createdBy,
      feedbackInput: params.feedbackInput,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function createSampleFeedbackPatch(params: {
  surveyId: string;
  feedbackEntryId: string;
  conversationNumber: number;
  status: string;
  patch: SampleFeedbackPatch;
}) {
  const [created] = await getDb()
    .insert(sampleFeedbackPatches)
    .values({
      id: nanoid(),
      surveyId: params.surveyId,
      feedbackEntryId: params.feedbackEntryId,
      conversationNumber: params.conversationNumber,
      status: params.status,
      patch: params.patch,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function replaceConductingProfile(params: {
  surveyId: string;
  mode: "sample" | "live";
  sourcePatchId?: string | null;
  profile: SampleConductingProfile;
}) {
  await getDb()
    .update(surveyConductingProfiles)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(surveyConductingProfiles.surveyId, params.surveyId), eq(surveyConductingProfiles.mode, params.mode)));

  const [created] = await getDb()
    .insert(surveyConductingProfiles)
    .values({
      id: nanoid(),
      surveyId: params.surveyId,
      mode: params.mode,
      version: params.profile.version,
      sourcePatchId: params.sourcePatchId ?? null,
      profile: params.profile,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function getActiveConductingProfile(surveyId: string, mode: "sample" | "live") {
  const [profile] = await getDb()
    .select()
    .from(surveyConductingProfiles)
    .where(
      and(
        eq(surveyConductingProfiles.surveyId, surveyId),
        eq(surveyConductingProfiles.mode, mode),
        eq(surveyConductingProfiles.isActive, true),
      ),
    )
    .orderBy(desc(surveyConductingProfiles.version));
  return profile ?? null;
}

export async function getOrCreateRefinementThread(params: {
  surveyId: string;
  createdBy: string;
  sampleConversationId?: string | null;
}) {
  const [existing] = await getDb()
    .select()
    .from(refinementThreads)
    .where(eq(refinementThreads.surveyId, params.surveyId));
  if (existing) return existing;

  const [created] = await getDb()
    .insert(refinementThreads)
    .values({
      id: nanoid(),
      surveyId: params.surveyId,
      sampleConversationId: params.sampleConversationId ?? null,
      createdBy: params.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function listRefinementMessages(threadId: string) {
  return getDb()
    .select()
    .from(refinementMessages)
    .where(eq(refinementMessages.threadId, threadId))
    .orderBy(asc(refinementMessages.createdAt));
}

export async function appendRefinementMessage(params: {
  threadId: string;
  role: "user" | "assistant";
  content: string;
}) {
  const message: RefinementMessage = {
    id: nanoid(),
    role: params.role,
    content: params.content,
    createdAt: new Date().toISOString(),
  };
  const [created] = await getDb()
    .insert(refinementMessages)
    .values({
      id: message.id,
      threadId: params.threadId,
      role: params.role,
      content: params.content,
      message,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function createRefinementProposal(params: {
  threadId: string;
  surveyId: string;
  proposal: RefinementProposal;
}) {
  const [created] = await getDb()
    .insert(refinementProposals)
    .values({
      id: params.proposal.id,
      threadId: params.threadId,
      surveyId: params.surveyId,
      type: params.proposal.type,
      status: params.proposal.status,
      originalRequest: params.proposal.originalRequest,
      interpretation: params.proposal.interpretation,
      runtimeEffect: params.proposal.runtimeEffect,
      payload: params.proposal.payload,
      proposal: params.proposal,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function listRefinementProposals(threadId: string) {
  return getDb()
    .select()
    .from(refinementProposals)
    .where(eq(refinementProposals.threadId, threadId))
    .orderBy(desc(refinementProposals.createdAt));
}

export async function getRefinementProposal(proposalId: string) {
  const [proposal] = await getDb()
    .select()
    .from(refinementProposals)
    .where(eq(refinementProposals.id, proposalId));
  return proposal ?? null;
}

export async function updateRefinementProposalStatus(
  proposalId: string,
  status: "approved" | "rejected",
) {
  const proposal = await getRefinementProposal(proposalId);
  if (!proposal) return null;
  const [updated] = await getDb()
    .update(refinementProposals)
    .set({
      status,
      proposal: {
        ...proposal.proposal,
        status,
      },
      updatedAt: new Date(),
    })
    .where(eq(refinementProposals.id, proposalId))
    .returning();
  return updated;
}

export async function createResearchBriefPatchRecord(params: {
  surveyId: string;
  proposalId?: string | null;
  patch: ResearchBriefPatch;
  createdBy: string;
}) {
  const [created] = await getDb()
    .insert(researchBriefPatches)
    .values({
      id: nanoid(),
      surveyId: params.surveyId,
      proposalId: params.proposalId ?? null,
      patch: params.patch,
      createdBy: params.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}
