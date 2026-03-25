import { and, asc, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { documentEmbeddings } from "@/db/schema/vectors";
import {
  playbooks,
  playbookVersions,
  refinementMessages,
  refinementProposals,
  refinementThreads,
  sampleFeedbackEntries,
  sampleFeedbackPatches,
  researchBriefPatches,
  surveyPersonalityAssignments,
  surveyPlaybookAttachments,
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
  PlaybookAuthorInput,
  PlaybookInterpretation,
  PlaybookPreview,
  RefinementMessage,
  RefinementProposal,
  ResearchBriefPatch,
  SurveyPersonalityAssignment,
} from "./playbooks";

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

export async function replacePersonalityAssignment(params: {
  surveyId: string;
  mode: "sample" | "live";
  assignment: SurveyPersonalityAssignment;
}) {
  await getDb()
    .update(surveyPersonalityAssignments)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(surveyPersonalityAssignments.surveyId, params.surveyId),
        eq(surveyPersonalityAssignments.mode, params.mode),
      ),
    );

  const [created] = await getDb()
    .insert(surveyPersonalityAssignments)
    .values({
      id: nanoid(),
      surveyId: params.surveyId,
      mode: params.mode,
      version: params.assignment.version,
      assignment: params.assignment,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function getActivePersonalityAssignment(
  surveyId: string,
  mode: "sample" | "live",
) {
  const [assignment] = await getDb()
    .select()
    .from(surveyPersonalityAssignments)
    .where(
      and(
        eq(surveyPersonalityAssignments.surveyId, surveyId),
        eq(surveyPersonalityAssignments.mode, mode),
        eq(surveyPersonalityAssignments.isActive, true),
      ),
    )
    .orderBy(desc(surveyPersonalityAssignments.version));
  return assignment ?? null;
}

export async function createPlaybook(params: {
  surveyId?: string | null;
  organizationId?: string | null;
  createdBy: string;
  scope: "survey" | "workspace";
  phase: "creation" | "conducting" | "analytics";
  name: string;
  input: PlaybookAuthorInput;
  interpretation: PlaybookInterpretation;
  preview: PlaybookPreview;
  status: string;
  attachToSurveyId?: string | null;
}) {
  const [playbook] = await getDb()
    .insert(playbooks)
    .values({
      id: nanoid(),
      surveyId: params.scope === "survey" ? params.surveyId ?? null : null,
      organizationId: params.scope === "workspace" ? params.organizationId ?? null : params.organizationId ?? null,
      createdBy: params.createdBy,
      scope: params.scope,
      phase: params.phase,
      name: params.name,
      status: params.status,
      latestVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  const [version] = await getDb()
    .insert(playbookVersions)
    .values({
      id: nanoid(),
      playbookId: playbook.id,
      version: 1,
      status: params.status,
      input: params.input,
      interpretation: params.interpretation,
      preview: params.preview,
      createdBy: params.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await getDb()
    .update(playbooks)
    .set({
      activeVersionId: params.status === "approved" ? version.id : null,
      updatedAt: new Date(),
    })
    .where(eq(playbooks.id, playbook.id));

  if (params.scope === "workspace" && params.attachToSurveyId) {
    await attachPlaybookToSurvey({
      surveyId: params.attachToSurveyId,
      playbookId: playbook.id,
      attachedBy: params.createdBy,
    });
  }

  return { playbook, version };
}

export async function createPlaybookVersion(params: {
  playbookId: string;
  createdBy: string;
  input: PlaybookAuthorInput;
  interpretation: PlaybookInterpretation;
  preview: PlaybookPreview;
  status: string;
}) {
  const [playbook] = await getDb().select().from(playbooks).where(eq(playbooks.id, params.playbookId));
  if (!playbook) return null;
  const versionNumber = (playbook.latestVersion ?? 0) + 1;
  const [version] = await getDb()
    .insert(playbookVersions)
    .values({
      id: nanoid(),
      playbookId: params.playbookId,
      version: versionNumber,
      status: params.status,
      input: params.input,
      interpretation: params.interpretation,
      preview: params.preview,
      createdBy: params.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await getDb()
    .update(playbooks)
    .set({
      latestVersion: versionNumber,
      status: params.status,
      updatedAt: new Date(),
    })
    .where(eq(playbooks.id, params.playbookId));
  return version;
}

export async function approvePlaybookVersion(params: {
  playbookId: string;
  versionId: string;
  approvedBy: string;
}) {
  await getDb()
    .update(playbookVersions)
    .set({
      status: "approved",
      approvedBy: params.approvedBy,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(playbookVersions.id, params.versionId));

  await getDb()
    .update(playbooks)
    .set({
      status: "approved",
      activeVersionId: params.versionId,
      updatedAt: new Date(),
    })
    .where(eq(playbooks.id, params.playbookId));
}

export async function archivePlaybook(playbookId: string) {
  await getDb()
    .update(playbooks)
    .set({
      status: "archived",
      activeVersionId: null,
      updatedAt: new Date(),
    })
    .where(eq(playbooks.id, playbookId));
}

export async function attachPlaybookToSurvey(params: {
  surveyId: string;
  playbookId: string;
  attachedBy: string;
}) {
  const [existing] = await getDb()
    .select()
    .from(surveyPlaybookAttachments)
    .where(
      and(
        eq(surveyPlaybookAttachments.surveyId, params.surveyId),
        eq(surveyPlaybookAttachments.playbookId, params.playbookId),
      ),
    );

  if (existing) {
    const [updated] = await getDb()
      .update(surveyPlaybookAttachments)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(surveyPlaybookAttachments.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await getDb()
    .insert(surveyPlaybookAttachments)
    .values({
      id: nanoid(),
      surveyId: params.surveyId,
      playbookId: params.playbookId,
      attachedBy: params.attachedBy,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function detachPlaybookFromSurvey(surveyId: string, playbookId: string) {
  await getDb()
    .update(surveyPlaybookAttachments)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(surveyPlaybookAttachments.surveyId, surveyId),
        eq(surveyPlaybookAttachments.playbookId, playbookId),
      ),
    );
}

export async function listPlaybooksForSurvey(params: {
  surveyId: string;
  organizationId?: string | null;
  phase?: "creation" | "conducting" | "analytics";
}) {
  const base = await getDb().select().from(playbooks);
  const filtered = base.filter((playbook) => {
    if (params.phase && playbook.phase !== params.phase) return false;
    if (playbook.scope === "survey") return playbook.surveyId === params.surveyId;
    return Boolean(params.organizationId && playbook.organizationId === params.organizationId);
  });

  const versions = filtered.length > 0
    ? (await getDb().select().from(playbookVersions)).filter((version) =>
        filtered.some((playbook) => playbook.id === version.playbookId),
      )
    : [];
  const attachments = await getDb()
    .select()
    .from(surveyPlaybookAttachments)
    .where(and(eq(surveyPlaybookAttachments.surveyId, params.surveyId), eq(surveyPlaybookAttachments.isActive, true)));

  return filtered.map((playbook) => ({
    playbook,
    activeVersion:
      versions.find((version) => version.id === playbook.activeVersionId) ??
      versions
        .filter((version) => version.playbookId === playbook.id)
        .sort((left, right) => right.version - left.version)[0] ??
      null,
    isAttached:
      playbook.scope === "survey" ||
      attachments.some((attachment) => attachment.playbookId === playbook.id),
  }));
}

export async function listEffectivePlaybooks(params: {
  surveyId: string;
  organizationId?: string | null;
  phase: "creation" | "conducting" | "analytics";
}) {
  const records = await listPlaybooksForSurvey(params);
  return records
    .filter((record) => record.activeVersion && record.playbook.status === "approved" && record.isAttached)
    .sort((a, b) => {
      if (a.playbook.scope === b.playbook.scope) return 0;
      return a.playbook.scope === "workspace" ? -1 : 1;
    });
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
        ...(proposal.proposal as RefinementProposal),
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
