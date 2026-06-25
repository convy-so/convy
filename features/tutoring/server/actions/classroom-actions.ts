"use server";

import { z } from "zod";

import { resolveUiLocaleForContentCreation } from "@/shared/i18n/resolve-locale";
import * as ClassroomService from "@/features/tutoring/server/classroom-service";
import {
  ActionResult,
  validateInput,
  withErrorHandling,
} from "@/shared/http/action-result";

import { appLocaleSchema, requireTeachingSession, revalidateLearningUi } from "./action-access";

const createClassroomSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  gradeLabel: z.string().trim().min(1),
  defaultContentLocale: appLocaleSchema.optional(),
});

export async function createClassroomAction(input: unknown): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, createClassroomSchema);
    const { session } = await requireTeachingSession();
    const defaultContentLocale = resolveUiLocaleForContentCreation({ explicitLocale: body.defaultContentLocale ?? null, session });

    const result = await ClassroomService.createClassroom({
      teacherUserId: session.user.id,
      title: body.title,
      description: body.description,
      subject: body.subject,
      gradeLabel: body.gradeLabel,
      defaultContentLocale,
    });
    revalidateLearningUi();
    return { success: true, data: result };
  }, "createClassroomAction");
}
