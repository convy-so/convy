"use server";

import { z } from "zod";

import { resolveUiLocaleForContentCreation } from "@/lib/i18n/resolve-locale";
import * as TopicService from "@/lib/learning/topic-service";
import {
  learningOutcomeDefinitionSchema,
  topicSourceBoundarySchema,
} from "@/lib/learning/types";
import { getDb } from "@/db";
import { learningTopics } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTeacherTopicAccess } from "@/lib/learning/access";
import { ActionResult, validateInput, withErrorHandling } from "@/lib/action-wrapper";

import { appLocaleSchema, ensureClassroomOwnerAccess, requireTeachingSession, revalidateLearningUi } from "./shared";

const createLearningTopicSchema = z.object({
  classroomId: z.string().min(1),
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  subjectKey: z.string().trim().optional(),
  subjectLabel: z.string().trim().optional(),
  learningOutcomes: z.array(learningOutcomeDefinitionSchema).min(1),
  sourceBoundary: topicSourceBoundarySchema.optional(),
  contentLocale: appLocaleSchema.optional(),
});

const updateTopicStatusSchema = z.object({
  topicId: z.string().min(1),
  status: z.enum(["draft", "active", "paused", "archived"]),
});

export async function createLearningTopicAction(input: unknown): Promise<ActionResult<unknown>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, createLearningTopicSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);
    const normalizedLearningOutcomes = body.learningOutcomes.map((outcome) =>
      learningOutcomeDefinitionSchema.parse(outcome),
    );
    const normalizedSourceBoundary = topicSourceBoundarySchema.parse(
      body.sourceBoundary ?? {},
    );

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
      learningOutcomes: normalizedLearningOutcomes,
      sourceBoundary: normalizedSourceBoundary,
    });

    revalidateLearningUi();
    return { success: true, data: { id: result.id, classroomId: result.classroomId, title: result.title, learningOutcomeCount: result.learningOutcomes.length, contentLocale: result.contentLocale } };
  }, "createLearningTopicAction");
}

export async function updateTopicStatusAction(input: unknown): Promise<ActionResult<{ id: string; status: string }>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, updateTopicStatusSchema);
    const { session } = await requireTeachingSession();
    const topic = await getTeacherTopicAccess(session.user.id, body.topicId);

    if (!topic) {
      throw new Error("Unauthorized");
    }

    await getDb()
      .update(learningTopics)
      .set({
        status: body.status,
        updatedAt: new Date(),
      })
      .where(eq(learningTopics.id, body.topicId));

    revalidateLearningUi();
    return { success: true, data: { id: body.topicId, status: body.status } };
  }, "updateTopicStatusAction");
}
