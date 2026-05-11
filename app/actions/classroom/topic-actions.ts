"use server";

import { z } from "zod";

import { resolveUiLocaleForContentCreation } from "@/lib/i18n/resolve-locale";
import * as TopicService from "@/lib/learning/topic-service";
import { ActionResult, validateInput, withErrorHandling } from "@/lib/action-wrapper";

import { appLocaleSchema, ensureClassroomOwnerAccess, requireTeachingSession } from "./shared";

const createLearningTopicSchema = z.object({
  classroomId: z.string().min(1),
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  subjectKey: z.string().trim().optional(),
  subjectLabel: z.string().trim().optional(),
  learningOutcomes: z.array(z.any()).min(1),
  sourceBoundary: z.any().optional(),
  contentLocale: appLocaleSchema.optional(),
});

export async function createLearningTopicAction(input: unknown): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, createLearningTopicSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);

    const contentLocale = await resolveUiLocaleForContentCreation({ explicitLocale: body.contentLocale ?? null, session });
    const result = await TopicService.createLearningTopic({
      classroomId: body.classroomId,
      createdByUserId: session.user.id,
      title: body.title,
      description: body.description,
      subject: body.subject,
      subjectKey: body.subjectKey,
      subjectLabel: body.subjectLabel,
      contentLocale,
      learningOutcomes: body.learningOutcomes,
      sourceBoundary: body.sourceBoundary,
    });

    return { success: true, data: { id: result.id, classroomId: result.classroomId, title: result.title, learningOutcomeCount: result.learningOutcomes.length, contentLocale: result.contentLocale } };
  }, "createLearningTopicAction");
}
