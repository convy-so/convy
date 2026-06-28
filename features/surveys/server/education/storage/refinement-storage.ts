import { asc, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import {
  refinementMessages,
  refinementProposals,
  refinementThreads,
  researchBriefPatches,
} from "@/shared/db/schema";
import { requireValue } from "@/shared/utils/collections";
import type {
  RefinementMessage,
  RefinementProposal,
  ResearchBriefPatch,
} from "../refinement-schemas";

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
  return requireValue(
    created,
    `Failed to create refinement thread for survey ${params.surveyId}`,
  );
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
  return requireValue(
    created,
    `Failed to append refinement message for thread ${params.threadId}`,
  );
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
  return requireValue(
    created,
    `Failed to create refinement proposal for thread ${params.threadId}`,
  );
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
