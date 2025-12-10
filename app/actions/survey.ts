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

/**
 * Schema for updating survey settings
 * Note: Auto-generated fields (goal, type, information, requiredQuestions) cannot be manually edited
 * These are generated from the conversational creation flow
 */
const updateSurveySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  participantLimit: z.number().int().positive().max(10000).optional(),
  language: z.enum(["en", "fr", "de"]).optional(),
  // Note: goal, type, information, requiredQuestions, metrics are auto-generated
  // and should not be manually edited after creation
});

/**
 * Update survey settings (only if it's in draft or sample_review status)
 * Note: This only allows updating basic settings like title and participant limit.
 * Survey content (goal, questions, metrics) is generated from the conversational creation flow
 * and cannot be manually edited. Use the conversational creation flow to make content changes.
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
    if (
      existingSurvey.status !== "draft" &&
      existingSurvey.status !== "sample_review"
    ) {
      return {
        success: false,
        error: "Cannot update survey in current status",
      };
    }

    // Only allow updating basic settings, not auto-generated content
    const updateData: Partial<typeof surveys.$inferInsert> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.participantLimit !== undefined)
      updateData.participantLimit = body.participantLimit;
    if (body.language !== undefined) updateData.language = body.language;

    await db.update(surveys).set(updateData).where(eq(surveys.id, body.id));

    return { success: true, data: { id: body.id } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
      };
    }
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
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
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
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
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
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
): Promise<
  ActionResult<{ id: string; shareableLink: string; publicUrl: string }>
> {
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

    // Allow confirmation from either draft or sample_review status
    if (survey.status !== "sample_review" && survey.status !== "draft") {
      return {
        success: false,
        error: "Survey must be in draft or sample_review status to confirm",
      };
    }

    // Check if survey has necessary structured configuration
    // Required fields: objective, targetAudience, scope, successCriteria, constraints
    if (
      !survey.objective ||
      !survey.targetAudience ||
      !survey.scope ||
      !survey.successCriteria ||
      !survey.constraints
    ) {
      return {
        success: false,
        error:
          "Survey is missing required configuration. Please complete the creation conversation.",
      };
    }

    if (survey.status === "sample_review" && !survey.confirmed) {
      return {
        success: false,
        error:
          "Please confirm at least one sample conversation before activating the survey",
      };
    }

    let shareableLink = survey.shareableLink;
    if (!shareableLink) {
      shareableLink = `survey-${nanoid(12)}`;
    }

    await db
      .update(surveys)
      .set({
        status: "active",
        shareableLink,
      })
      .where(eq(surveys.id, surveyId));

    // Trigger Slack auto-post for survey creation (async, don't wait)
    try {
      const { autoPostSurveyCreated } = await import("@/app/actions/slack");
      autoPostSurveyCreated(session.user.id, surveyId).catch((error) => {
        console.error("Failed to auto-post survey to Slack:", error);
        // Don't fail the survey confirmation if Slack post fails
      });
    } catch (error) {
      console.error("Failed to import Slack auto-post function:", error);
    }

    const publicUrl = `/s/${shareableLink}`;

    return {
      success: true,
      data: {
        id: surveyId,
        shareableLink,
        publicUrl,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to confirm survey" };
  }
}

/**
 * Get the shareable link for a survey
 */
export async function getShareableLinkAction(
  surveyId: string
): Promise<
  ActionResult<{ shareableLink: string; publicUrl: string; isActive: boolean }>
> {
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

    if (!survey.shareableLink) {
      return {
        success: false,
        error: "Survey does not have a shareable link yet",
      };
    }

    return {
      success: true,
      data: {
        shareableLink: survey.shareableLink,
        publicUrl: `/s/${survey.shareableLink}`,
        isActive: survey.status === "active",
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to get shareable link" };
  }
}

/**
 * Deactivate a survey (pause it from receiving new responses)
 */
export async function deactivateSurveyAction(
  surveyId: string
): Promise<ActionResult<{ id: string }>> {
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

    if (survey.status !== "active") {
      return { success: false, error: "Survey is not active" };
    }

    await db
      .update(surveys)
      .set({ status: "completed" })
      .where(eq(surveys.id, surveyId));

    return { success: true, data: { id: surveyId } };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to deactivate survey" };
  }
}

/**
 * Reactivate a completed survey
 */
export async function reactivateSurveyAction(
  surveyId: string
): Promise<ActionResult<{ id: string }>> {
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

    if (survey.status !== "completed") {
      return { success: false, error: "Survey is not completed" };
    }

    if (survey.currentParticipants >= survey.participantLimit) {
      return {
        success: false,
        error:
          "Survey has reached participant limit. Increase the limit to reactivate.",
      };
    }

    await db
      .update(surveys)
      .set({ status: "active" })
      .where(eq(surveys.id, surveyId));

    return { success: true, data: { id: surveyId } };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to reactivate survey" };
  }
}
