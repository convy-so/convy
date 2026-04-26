"use server";

import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { expertCrystallizations } from "@/db/schema/learning";
import { getVerifiedSession } from "@/lib/auth/session";
import { hasAiOpsAccess } from "@/lib/auth/expert";
import type { ExpertHeuristic } from "@/lib/learning/types";

export async function listDraftCrystallizations() {
  const session = await getVerifiedSession();
  if (!session || !hasAiOpsAccess(session.user)) {
    throw new Error("Unauthorized");
  }

  return await getDb().query.expertCrystallizations.findMany({
    where: eq(expertCrystallizations.status, "draft"),
    orderBy: [desc(expertCrystallizations.createdAt)],
    with: {
      topic: true,
    },
  });
}

export async function approveCrystallization(params: {
  id: string;
  title: string;
  heuristic: ExpertHeuristic;
  relevanceScope: string;
  notes?: string;
}) {
  const session = await getVerifiedSession();
  if (!session || !hasAiOpsAccess(session.user)) {
    throw new Error("Unauthorized");
  }

  await getDb()
    .update(expertCrystallizations)
    .set({
      title: params.title,
      heuristic: params.heuristic,
      notes: params.notes,
      relevanceScope: params.relevanceScope,
      status: "approved",
      approvedByUserId: session.user.id,
      approvedAt: new Date(),
    })
    .where(eq(expertCrystallizations.id, params.id));

  revalidatePath("/[locale]/expert/knowledge", "page");
  return { success: true };
}

export async function rejectCrystallization(id: string) {
  const session = await getVerifiedSession();
  if (!session || !hasAiOpsAccess(session.user)) {
    throw new Error("Unauthorized");
  }

  await getDb()
    .update(expertCrystallizations)
    .set({
      status: "archived",
      updatedAt: new Date(),
    })
    .where(eq(expertCrystallizations.id, id));

  revalidatePath("/[locale]/expert/knowledge", "page");
  return { success: true };
}
