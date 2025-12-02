"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const createSurveySchema = z.object({
  title: z.string().min(1, "Title is required"),
  goal: z.string().min(1, "Goal is required"),
  type: z.string().min(1, "Type is required"),
  information: z.string().min(1, "Information to collect is required"),
  requiredQuestions: z.array(z.string()).min(1, "At least one required question is needed"),
  metrics: z.array(z.string()).optional().default([]),
  participantLimit: z.number().int().positive().max(10000).optional().default(100),
  language: z.enum(["en", "fr", "de"]).optional().default("en"),
});

const updateSurveySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  goal: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  information: z.string().min(1).optional(),
  requiredQuestions: z.array(z.string()).optional(),
  metrics: z.array(z.string()).optional(),
  participantLimit: z.number().int().positive().max(10000).optional(),
  language: z.enum(["en", "fr", "de"]).optional(),
});

export async function createSurveyAction(
  input: z.infer<typeof createSurveySchema>
): Promise<ActionResult<{ id: string; shareableLink: string | null }>> {
  try {
    const session = await getVerifiedSession();
    const body = createSurveySchema.parse(input);

    const surveyId = nanoid();
    const shareableLink = `survey-${nanoid(12)}`;

    const [survey] = await db
      .insert(surveys)
      .values({
        id: surveyId,
        userId: session.user.id,
        title: body.title,
        goal: body.goal,
        type: body.type,
        information: body.information,
        requiredQuestions: body.requiredQuestions,
        metrics: body.metrics ?? [],
        participantLimit: body.participantLimit ?? 100,
        shareableLink,
        status: "draft",
        language: body.language ?? "en",
      })
      .returning({ id: surveys.id, shareableLink: surveys.shareableLink });

    return { success: true, data: survey };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message ?? "Validation error" };
    }
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create survey" };
  }
}

/**
 * Update a survey (only if it's in draft or sample_review status)
 */
export async function updateSurveyAction(
  input: z.infer<typeof updateSurveySchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();
    const body = updateSurveySchema.parse(input);

    // Check if survey exists and belongs to user
    const [existingSurvey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.id));

    if (!existingSurvey) {
      return { success: false, error: "Survey not found" };
    }

    if (existingSurvey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Only allow updates if survey is in draft or sample_review status
    if (existingSurvey.status !== "draft" && existingSurvey.status !== "sample_review") {
      return { success: false, error: "Cannot update survey in current status" };
    }

    const updateData: Partial<typeof surveys.$inferInsert> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.goal !== undefined) updateData.goal = body.goal;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.information !== undefined) updateData.information = body.information;
    if (body.requiredQuestions !== undefined) updateData.requiredQuestions = body.requiredQuestions;
    if (body.metrics !== undefined) updateData.metrics = body.metrics;
    if (body.participantLimit !== undefined) updateData.participantLimit = body.participantLimit;
    if (body.language !== undefined) updateData.language = body.language;

    await db.update(surveys).set(updateData).where(eq(surveys.id, body.id));

    return { success: true, data: { id: body.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message ?? "Validation error" };
    }
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update survey" };
  }
}

/**
 * Get all surveys for the current user
 */
export async function getSurveysAction(): Promise<
  ActionResult<
    Array<{
      id: string;
      title: string;
      status: string;
      createdAt: Date;
      currentParticipants: number;
      participantLimit: number;
      shareableLink: string | null;
    }>
  >
> {
  try {
    const session = await getVerifiedSession();

    const userSurveys = await db
      .select({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
        createdAt: surveys.createdAt,
        currentParticipants: surveys.currentParticipants,
        participantLimit: surveys.participantLimit,
        shareableLink: surveys.shareableLink,
      })
      .from(surveys)
      .where(eq(surveys.userId, session.user.id))
      .orderBy(surveys.createdAt);

    return { success: true, data: userSurveys };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch surveys" };
  }
}

/**
 * Get a single survey by ID
 */
export async function getSurveyAction(
  surveyId: string
): Promise<ActionResult<typeof surveys.$inferSelect>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    return { success: true, data: survey };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch survey" };
  }
}

/**
 * Confirm a survey (after sample conversations are approved)
 * This activates the survey and makes it available for participants
 */
export async function confirmSurveyAction(
  surveyId: string
): Promise<ActionResult<{ id: string; shareableLink: string }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (survey.status !== "sample_review") {
      return { success: false, error: "Survey must be in sample_review status to confirm" };
    }

    if (!survey.confirmed) {
      return { success: false, error: "Survey must have confirmed sample conversations" };
    }

    await db
      .update(surveys)
      .set({
        status: "active",
      })
      .where(eq(surveys.id, surveyId));

    return {
      success: true,
      data: { id: surveyId, shareableLink: survey.shareableLink! },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to confirm survey" };
  }
}

