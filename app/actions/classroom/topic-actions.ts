"use server";

import { Output, generateText } from "ai";
import { z } from "zod";

import { analysisModel } from "@/lib/ai";
import { resolveUiLocaleForContentCreation } from "@/lib/i18n/resolve-locale";
import * as TopicService from "@/lib/learning/topic-service";
import {
  getSubjectDisplayLabel,
} from "@/lib/learning/subject-packages";
import {
  learningOutcomeDefinitionSchema,
  topicSourceBoundarySchema,
} from "@/lib/learning/types";
import { getDb } from "@/db";
import { learningTopics, topicMaterials } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { getTeacherTopicAccess } from "@/lib/learning/access";
import { getTopicWithMaterials } from "@/lib/learning/storage";
import {
  getOrGenerateTopicReadiness,
  isReadinessQuotaError,
} from "@/lib/learning/readiness";
import { isMaterialAnalysisFailed } from "@/lib/learning/materials-route-service";
import { ActionError, ActionResult, validateInput, withErrorHandling } from "@/lib/action-wrapper";

import { appLocaleSchema, ensureClassroomOwnerAccess, requireTeachingSession, revalidateLearningUi } from "./shared";

const createLearningTopicSchema = z.object({
  classroomId: z.string().min(1),
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  courseId: z.string().min(1),
  subjectKey: z.string().min(1),
  learningOutcomes: z.array(learningOutcomeDefinitionSchema).optional(),
  sourceBoundary: topicSourceBoundarySchema.optional(),
  contentLocale: appLocaleSchema.optional(),
});

const updateLearningTopicDetailsSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().trim().min(2).optional(),
  description: z.string().trim().optional(),
  learningOutcomes: z.array(learningOutcomeDefinitionSchema).optional(),
  sourceBoundary: topicSourceBoundarySchema.optional(),
  contentLocale: appLocaleSchema.optional(),
});

const updateTopicStatusSchema = z.object({
  topicId: z.string().min(1),
  status: z.enum(["draft", "active", "paused", "archived"]),
});

const normalizeLearningOutcomesSchema = z.object({
  topicId: z.string().min(1),
  rawNotes: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

const normalizedOutcomeCandidateSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  reviewNote: z.string().nullable().default(null),
});

const normalizedLearningOutcomesResultSchema = z.object({
  outcomes: z.array(normalizedOutcomeCandidateSchema).min(1).max(8),
});

function isTransientSessionServiceError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Connection terminated unexpectedly") ||
    error.message.includes("Failed query: select") ||
    error.message.includes("ENOTFOUND")
  );
}

function isOutcomeGenerationServiceError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name.includes("APICallError") ||
    error.name.includes("RetryError") ||
    error.name.includes("LoadAPIKeyError") ||
    error.message.includes("Cannot connect to API") ||
    error.message.includes("API key is missing") ||
    error.message.includes("Failed after")
  );
}

export async function createLearningTopicAction(input: unknown): Promise<
  ActionResult<{
    id: string;
    classroomId: string;
    title: string;
    learningOutcomeCount: number;
    contentLocale: string;
  }>
> {
  return withErrorHandling(async () => {
    const body = validateInput(input, createLearningTopicSchema);
    const { session } = await requireTeachingSession();
    await ensureClassroomOwnerAccess(session.user.id, body.classroomId);
    const normalizedLearningOutcomes = (body.learningOutcomes ?? []).map((outcome) =>
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
      courseId: body.courseId,
      subjectKey: body.subjectKey,
      contentLocale,
      learningOutcomes: normalizedLearningOutcomes,
      sourceBoundary: normalizedSourceBoundary,
    });

    revalidateLearningUi();
    return { success: true, data: { id: result.id, classroomId: result.classroomId, title: result.title, learningOutcomeCount: result.learningOutcomes.length, contentLocale: result.contentLocale } };
  }, "createLearningTopicAction");
}

export async function updateLearningTopicDetailsAction(input: unknown): Promise<ActionResult<{
  id: string;
  title: string;
}>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, updateLearningTopicDetailsSchema);
    const { session } = await requireTeachingSession();
    const topic = await getTeacherTopicAccess(session.user.id, body.topicId);

    if (!topic) {
      throw new Error("Unauthorized");
    }

    const normalizedLearningOutcomes = (body.learningOutcomes ?? topic.learningOutcomes ?? []).map(
      (outcome) => learningOutcomeDefinitionSchema.parse(outcome),
    );
    const normalizedSourceBoundary = topicSourceBoundarySchema.parse({
      ...(topic.sourceBoundary ?? {}),
      ...(body.sourceBoundary ?? {}),
    });
    const contentLocale = body.contentLocale
      ? await resolveUiLocaleForContentCreation({
          explicitLocale: body.contentLocale,
          session,
        })
      : undefined;

    const result = await TopicService.updateLearningTopicDetails({
      topicId: body.topicId,
      title: body.title,
      description: body.description,
      contentLocale,
      learningOutcomes: normalizedLearningOutcomes,
      sourceBoundary: normalizedSourceBoundary,
    });

    revalidateLearningUi();
    return {
      success: true,
      data: {
        id: result.id,
        title: result.title,
      },
    };
  }, "updateLearningTopicDetailsAction");
}

export async function normalizeLearningOutcomesAction(input: unknown): Promise<
  ActionResult<{
    outcomes: Array<{
      title: string;
      description: string;
      reviewNote: string | null;
    }>;
  }>
> {
  return withErrorHandling(async () => {
    try {
      const body = validateInput(input, normalizeLearningOutcomesSchema);
      const { session } = await requireTeachingSession();
      const topic = await getTeacherTopicAccess(session.user.id, body.topicId);

      if (!topic) {
        throw new Error("Unauthorized");
      }

      const subjectName = getSubjectDisplayLabel(topic.subjectKey);

      const { output } = await generateText({
        model: analysisModel,
        output: Output.object({
          schema: normalizedLearningOutcomesResultSchema,
        }),
        maxOutputTokens: 1400,
        prompt: `You are helping a teacher turn rough session notes into high-quality learning outcomes.

Session title: ${body.title}
Subject: ${subjectName}
Session overview:
${body.description?.trim() || "None provided"}

Teacher notes:
${body.rawNotes}

Use these instructional standards:
- A learning outcome describes what the student will be able to do by the end of the session.
- Outcomes should be student-centered, measurable, and specific.
- Prefer Bloom-style observable verbs such as explain, solve, compare, justify, analyze, evaluate, design, apply, identify, or construct.
- Avoid vague verbs such as know, understand, learn about, appreciate, be aware of, be familiar with, or teacher agenda language like "we will cover".
- A strong outcome usually includes an action, the content or skill, and a condition, evidence target, or success standard when that can be inferred.

Instructions:
- Produce 2 to 6 concrete learning outcomes unless the notes clearly justify fewer.
- Keep each outcome atomic. Split combined goals into separate outcomes when needed.
- Use clear instructional verbs that make assessment possible.
- Stay close to the teacher's intent. Do not invent content that is not implied by the notes or overview.
- If the notes are vague, still propose the best possible outcome and add a short reviewNote explaining what should be clarified.
- If an outcome is still too broad, uses a weak verb, combines multiple goals, or lacks a clear standard, use reviewNote to say exactly what needs tightening.
- Titles should be concise and scannable.
- Descriptions should be plain-language and teacher-friendly.
- Fewer, stronger outcomes are better than many weak ones.
- Return only the structured outcomes.`,
      });

      return {
        success: true,
        data: {
          outcomes: output.outcomes,
        },
      };
    } catch (error) {
      if (isTransientSessionServiceError(error)) {
        throw new ActionError(
          "Your session could not be verified because a required service connection was interrupted. Please try again in a moment.",
          "SESSION_SERVICE_UNAVAILABLE",
          503,
        );
      }

      if (isOutcomeGenerationServiceError(error)) {
        throw new ActionError(
          "The learning-outcome generator is temporarily unavailable. Please try again in a moment.",
          "OUTCOME_GENERATOR_UNAVAILABLE",
          503,
        );
      }

      throw error;
    }
  }, "normalizeLearningOutcomesAction");
}

export async function updateTopicStatusAction(input: unknown): Promise<ActionResult<{ id: string; status: string }>> {
  return withErrorHandling(async () => {
    const body = validateInput(input, updateTopicStatusSchema);
    const { session } = await requireTeachingSession();
    const topic = await getTeacherTopicAccess(session.user.id, body.topicId);

    if (!topic) {
      throw new Error("Unauthorized");
    }

    const materialCountResult = await getDb()
      .select({ value: count() })
      .from(topicMaterials)
      .where(eq(topicMaterials.topicId, body.topicId));
    const materialCount = Number(materialCountResult[0]?.value ?? 0);
    const hasLearningOutcomes = (topic.learningOutcomes?.length ?? 0) > 0;

    if (body.status === "active") {
      if (!hasLearningOutcomes || materialCount === 0) {
        throw new Error(
          "Add at least one learning outcome and one supporting material before activating this session.",
        );
      }

      if (topic.status !== "draft" && topic.status !== "paused") {
        throw new Error("Only draft or paused sessions can be activated.");
      }

      const topicWithMaterials = await getTopicWithMaterials(body.topicId);
      if (!topicWithMaterials) {
        throw new Error("Session not found.");
      }

      const completedMaterials = topicWithMaterials.materials.filter(
        (material) =>
          material.extractionStatus === "completed" &&
          material.indexingStatus === "completed" &&
          !isMaterialAnalysisFailed(material.analysis),
      );
      if (completedMaterials.length === 0) {
        throw new ActionError(
          "Upload and finish processing at least one supporting material before activating this session.",
          "VALIDATION_ERROR",
          400,
        );
      }

      try {
        const readiness = await getOrGenerateTopicReadiness({
          ...topicWithMaterials,
          materials: completedMaterials,
        });
        if (!readiness.data.ready) {
          const gaps = readiness.data.gaps.slice(0, 2).join(" ");
          throw new ActionError(
            `This session is not ready to activate. ${readiness.data.summary}${gaps ? ` Gaps: ${gaps}` : ""}`,
            "VALIDATION_ERROR",
            400,
          );
        }
      } catch (error) {
        if (error instanceof ActionError) {
          throw error;
        }

        if (isReadinessQuotaError(error)) {
          throw new ActionError(
            "The AI readiness check could not run because the AI quota is currently exhausted. Try again later before activating this session.",
            "RATE_LIMIT_EXCEEDED",
            429,
          );
        }

        throw new ActionError(
          "The AI readiness check could not complete. Try again later before activating this session.",
          "VALIDATION_ERROR",
          400,
        );
      }
    }

    if (body.status === "paused" && topic.status !== "active") {
      throw new Error("Only active sessions can be paused.");
    }

    if (body.status === "archived" && topic.status !== "active") {
      throw new Error("Only active sessions can be archived.");
    }

    if (body.status === "draft" && topic.status !== "draft") {
      throw new Error("Sessions cannot be moved back to draft.");
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
