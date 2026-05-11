import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  surveyAnalyticsFacts,
  surveyAnalyticsSnapshots,
  surveyAnalyticsStates,
  surveyEvidence,
  surveySessionInsights,
  surveySessions,
} from "@/db/schema";
import { documentEmbeddings } from "@/db/schema/vectors";
import type {
  AnalyticsFact,
  AnalyticsGenerationState,
  AnalyticsSnapshot,
  SessionType,
} from "../types";

export async function replaceAnalyticsSnapshot(
  surveyId: string,
  snapshot: AnalyticsSnapshot,
) {
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
    .where(
      and(
        eq(surveyAnalyticsSnapshots.surveyId, surveyId),
        eq(surveyAnalyticsSnapshots.isLatest, true),
      ),
    )
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

  if (evidenceRows.length === 0) {
    return;
  }

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
