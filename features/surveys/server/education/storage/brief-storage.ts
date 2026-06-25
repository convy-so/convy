import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { surveyBriefs, surveyCoveragePlans } from "@/shared/db/schema";
import type { CoveragePlan, ResearchBrief } from "../types";

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
    .where(
      and(
        eq(surveyCoveragePlans.surveyId, surveyId),
        eq(surveyCoveragePlans.isActive, true),
      ),
    )
    .orderBy(desc(surveyCoveragePlans.version));
  return plan ?? null;
}
