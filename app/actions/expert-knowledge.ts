"use server";

import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/shared/db";
import { expertCrystallizations } from "@/shared/db/schema/learning";
import { getVerifiedSession } from "@/features/auth/public-server";
import { isExpert } from "@/features/auth/public-server";
import {
  expertHeuristicSchema,
  type ExpertHeuristic,
} from "@/features/tutoring/public-server";
import {
  withErrorHandling,
  ActionResult,
  UnauthorizedError,
  validateInput,
} from "@/shared/http/action-result";
import { InferSelectModel } from "drizzle-orm";
import { lessons } from "@/shared/db/schema/learning";

export type ExpertCrystallizationWithLesson = InferSelectModel<typeof expertCrystallizations> & {
  lesson: InferSelectModel<typeof lessons> | null;
};

const approveCrystallizationSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1),
  heuristic: expertHeuristicSchema,
  relevanceScope: z.enum(["general", "framework_specific"]),
  notes: z.string().optional(),
});

export async function listDraftCrystallizations(): Promise<ActionResult<ExpertCrystallizationWithLesson[]>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    if (!session || !isExpert(session.user)) {
      throw new UnauthorizedError();
    }

    const data = await getDb().query.expertCrystallizations.findMany({
      where: eq(expertCrystallizations.status, "draft"),
      orderBy: [desc(expertCrystallizations.createdAt)],
      with: {
        lesson: true,
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
    const body = validateInput(params, approveCrystallizationSchema);
    const session = await getVerifiedSession();
    if (!session || !isExpert(session.user)) {
      throw new UnauthorizedError();
    }
    const normalizedHeuristic = expertHeuristicSchema.parse(body.heuristic);

    await getDb()
      .update(expertCrystallizations)
      .set({
        title: body.title,
        heuristic: normalizedHeuristic,
        notes: body.notes,
        relevanceScope: body.relevanceScope,
        status: "approved",
        approvedByUserId: session.user.id,
        approvedAt: new Date(),
      })
      .where(eq(expertCrystallizations.id, body.id));

    revalidatePath("/[locale]/expert/knowledge", "page");
    return { success: true, data: undefined };
  }, "approveCrystallization");
}

export async function rejectCrystallization(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const crystallizationId = validateInput(id, z.string().min(1));
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
      .where(eq(expertCrystallizations.id, crystallizationId));

    revalidatePath("/[locale]/expert/knowledge", "page");
    return { success: true, data: undefined };
  }, "rejectCrystallization");
}
