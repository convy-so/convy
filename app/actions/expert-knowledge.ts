"use server";

import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { expertCrystallizations } from "@/db/schema/learning";
import { getVerifiedSession } from "@/lib/auth/dal";
import { isExpert } from "@/lib/auth/dal";
import type { ExpertHeuristic } from "@/lib/learning/types";
import { withErrorHandling, ActionResult, UnauthorizedError } from "@/lib/action-wrapper";
import { InferSelectModel } from "drizzle-orm";
import { learningTopics } from "@/db/schema/learning";

export type ExpertCrystallizationWithTopic = InferSelectModel<typeof expertCrystallizations> & {
  topic: InferSelectModel<typeof learningTopics> | null;
};

export async function listDraftCrystallizations(): Promise<ActionResult<ExpertCrystallizationWithTopic[]>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    if (!session || !isExpert(session.user)) {
      throw new UnauthorizedError();
    }

    const data = await getDb().query.expertCrystallizations.findMany({
      where: eq(expertCrystallizations.status, "draft"),
      orderBy: [desc(expertCrystallizations.createdAt)],
      with: {
        topic: true,
      },
    });
    return { success: true, data };
  }, "listDraftCrystallizations");
}

export async function approveCrystallization(params: {
  id: string;
  title: string;
  heuristic: ExpertHeuristic;
  relevanceScope: string;
  notes?: string;
}): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    if (!session || !isExpert(session.user)) {
      throw new UnauthorizedError();
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
    return { success: true, data: undefined };
  }, "approveCrystallization");
}

export async function rejectCrystallization(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    if (!session || !isExpert(session.user)) {
      throw new UnauthorizedError();
    }

    await getDb()
      .update(expertCrystallizations)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(eq(expertCrystallizations.id, id));

    revalidatePath("/[locale]/expert/knowledge", "page");
    return { success: true, data: undefined };
  }, "rejectCrystallization");
}
