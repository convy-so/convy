"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { eq, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys, users } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";
import { invalidateDashboardCaches } from "@/lib/cache";
import { env } from "@/lib/env";
import {
  withErrorHandling,
  assertExists,
  assertPermission,
  assertState,
  validateInput,
  type ActionResult,
} from "@/lib/action-wrapper";
import {
  updateSurveySchema,
  surveyCustomSlugSchema,
  surveyIdSchema,
} from "@/lib/validation/survey-schemas";

/**
 * Update survey settings (only if it's in draft or sample_review status)
 * Note: This only allows updating basic settings like title and participant limit.
 * Survey content (goal, questions, metrics) is generated from the conversational creation flow
 * and cannot be manually edited. Use the conversational creation flow to make content changes.
 */
export async function updateSurveyAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();
    const body = validateInput(input, updateSurveySchema);

    // Check if survey exists
    const [existingSurvey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.id));

    assertExists(existingSurvey, "Survey");

    const permission = await getSurveyPermissionForSession(session, existingSurvey.id);
    assertPermission(
      hasSurveyPermission(permission, "canEdit"),
      "Editor access required"
    );

    // Only allow updates if survey is in draft or sample_review status
    assertState(
      existingSurvey.status === "draft" || existingSurvey.status === "sample_review",
      "Cannot update survey in current status"
    );

    // Only allow updating basic settings, not auto-generated content
    const updateData: Partial<typeof surveys.$inferInsert> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.participantLimit !== undefined)
      updateData.participantLimit = body.participantLimit;
    if (body.language !== undefined) updateData.language = body.language;

    await getDb().transaction(async (tx) => {
      await tx.update(surveys).set(updateData).where(eq(surveys.id, body.id));
    });

    await invalidateDashboardCaches(
      session.user.id,
      null,
    );

    return { success: true, data: { id: body.id } };
  }, "updateSurveyAction");
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
      deliveryMode: string;
      classroomId: string | null;
      folderId: string | null;
      classroomTitle: string | null;
      creatorName: string | null;
      isOwner: boolean;
      isVoice: boolean;
      accessLevel: "owner" | "editor" | "none";
      canOpen: boolean;
      canEdit: boolean;
    }>
  >
> {
  try {
    const session = await getVerifiedSession();
    const personalSurveys = await getDb()
      .select({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
        createdAt: surveys.createdAt,
        currentParticipants: surveys.currentParticipants,
        participantLimit: surveys.participantLimit,
        shareableLink: surveys.shareableLink,
        deliveryMode: surveys.deliveryMode,
        classroomId: surveys.classroomId,
        folderId: surveys.folderId,
        creatorName: users.name,
        isOwner: sql<boolean>`${surveys.userId} = ${session.user.id}`,
        isVoice: surveys.isVoice,
        classroomTitle: sql<string | null>`null`,
      })
      .from(surveys)
      .leftJoin(users, eq(surveys.userId, users.id))
      .where(eq(surveys.userId, session.user.id))
      .orderBy(surveys.createdAt);

    return {
      success: true,
      data: personalSurveys.map((survey) => ({
        ...survey,
        accessLevel: "owner",
        canOpen: true,
        canEdit: true,
      })),
    };
  } catch (error) {
    console.error("[getSurveysAction] Failed:", error);
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
  surveyId: string,
): Promise<ActionResult<typeof surveys.$inferSelect>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canView")) {
      return { success: false, error: "Unauthorized" };
    }

    // Access granted (creator, personal owner, or invited editor)
    return { success: true, data: survey };
  } catch (error) {
    console.error("[getSurveyAction] Failed:", error);
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
  surveyId: string,
): Promise<
  ActionResult<{ id: string; shareableLink: string; publicUrl: string }>
> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canPublish")) {
      return {
        success: false,
        error: "Unauthorized: Editor access required to publish survey",
      };
    }

    // Allow confirmation from either draft or sample_review status
    if (survey.status !== "sample_review" && survey.status !== "draft") {
      return {
        success: false,
        error: "Survey must be in draft or sample_review status to confirm",
      };
    }

    const { getResearchBrief } = await import("@/lib/education/storage");
    const briefRow = await getResearchBrief(surveyId);
    if (!briefRow?.brief) {
      return {
        success: false,
        error:
          "Survey is missing a canonical research brief. Please complete the creation workflow.",
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

    await getDb()
      .update(surveys)
      .set({
        status: "active",
        shareableLink,
      })
      .where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, null, [
      "recentSurveys",
    ]);



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
    console.error("[confirmSurveyAction] Failed:", error);
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
  surveyId: string,
): Promise<
  ActionResult<{ shareableLink: string; publicUrl: string; isActive: boolean }>
> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) {
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
    console.error("[getShareableLinkAction] Failed:", error);
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
 * Set or update a human-friendly custom slug for a survey
 * (Typeform-style custom URL). Gated by plan entitlements.
 */
export async function setSurveyCustomSlugAction(input: {
  surveyId: string;
  slug: string;
}): Promise<
  ActionResult<{ customSlug: string; publicUrl: string; shareableLink: string }>
> {
  try {
    const session = await getVerifiedSession();

    const schema = z.object({
      surveyId: z.string().min(1),
      slug: z
        .string()
        .min(3)
        .max(64)
        .regex(
          /^[a-z0-9-]+$/,
          "Slug can only contain lowercase letters, numbers, and hyphens",
        ),
    });

    const body = schema.parse(input);

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return { success: false, error: "Unauthorized" };
    }

    // Check uniqueness against other surveys' customSlug and shareableLink
    const [conflict] = await getDb()
      .select({ id: surveys.id })
      .from(surveys)
      .where(
        and(
          ne(surveys.id, survey.id),
          or(
            eq(surveys.customSlug, body.slug),
            eq(surveys.shareableLink, body.slug),
          ),
        ),
      );

    if (conflict) {
      return {
        success: false,
        error: "This URL is already in use by another survey",
      };
    }

    await getDb()
      .update(surveys)
      .set({ customSlug: body.slug })
      .where(eq(surveys.id, survey.id));

    const identifier = body.slug;
    const publicPath = `/s/${identifier}`;

    return {
      success: true,
      data: {
        customSlug: body.slug,
        publicUrl: publicPath,
        shareableLink: survey.shareableLink ?? "",
      },
    };
  } catch (error) {
    console.error("[setSurveyCustomSlugAction] Failed:", error);
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
    return { success: false, error: "Failed to set custom URL" };
  }
}

/**
 * Clear the custom slug for a survey, falling back to random shareable link
 */
export async function clearSurveyCustomSlugAction(
  surveyId: string,
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return { success: false, error: "Unauthorized" };
    }

    await getDb()
      .update(surveys)
      .set({ customSlug: null })
      .where(eq(surveys.id, survey.id));

    return { success: true, data: { success: true } };
  } catch (error) {
    console.error("[clearSurveyCustomSlugAction] Failed:", error);
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to clear custom URL" };
  }
}

/**
 * Get public URLs for a survey (default random link + optional custom slug)
 */
export async function getSurveyPublicUrlsAction(surveyId: string): Promise<
  ActionResult<{
    shareableLink: string | null;
    shareableUrl: string | null;
    customSlug: string | null;
    customUrl: string | null;
  }>
> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) {
      return { success: false, error: "Unauthorized" };
    }

    const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");

    const shareableUrl = survey.shareableLink
      ? `${baseUrl}/s/${survey.shareableLink}`
      : null;

    const customUrl = survey.customSlug
      ? `${baseUrl}/s/${survey.customSlug}`
      : null;

    return {
      success: true,
      data: {
        shareableLink: survey.shareableLink ?? null,
        shareableUrl,
        customSlug: survey.customSlug ?? null,
        customUrl,
      },
    };
  } catch (error) {
    console.error("[getSurveyPublicUrlsAction] Failed:", error);
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to get survey URLs" };
  }
}

/**
 * Deactivate a survey (pause it from receiving new responses)
 */
export async function deactivateSurveyAction(
  surveyId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return { success: false, error: "Unauthorized" };
    }

    if (survey.status !== "active") {
      return { success: false, error: "Survey is not active" };
    }

    await getDb()
      .update(surveys)
      .set({ status: "completed" })
      .where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, null, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: { id: surveyId } };
  } catch (error) {
    console.error("[deactivateSurveyAction] Failed:", error);
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
  surveyId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canEdit")) {
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

    await getDb()
      .update(surveys)
      .set({ status: "active" })
      .where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, null, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: { id: surveyId } };
  } catch (error) {
    console.error("[reactivateSurveyAction] Failed:", error);
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

/**
 * Delete a survey (Creator ONLY)
 * Removes survey and all related data (cascade).
 */
export async function deleteSurveyAction(
  surveyId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select({
        id: surveys.id,
        title: surveys.title,
        userId: surveys.userId,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canDelete")) {
      return {
        success: false,
        error: "Unauthorized: Only the survey creator can delete this survey",
      };
    }

    await getDb().delete(surveys).where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, null);

    return { success: true, data: { id: surveyId } };
  } catch (error) {
    console.error("[deleteSurveyAction] Failed:", error);
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete survey" };
  }
}

export async function duplicateSurveyAction(
  surveyId: string,
): Promise<
  ActionResult<{
    id: string;
    survey: {
      id: string;
      title: string;
      description: string;
      status: string;
      shareableLink: string | null;
      responses: number;
      completionRate: number;
      createdAt: string;
      lastResponse: string;
      isOwner: boolean;
      isVoice: boolean;
    };
  }>
> {
  try {
    const session = await getVerifiedSession();

    const [existingSurvey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!existingSurvey) {
      return { success: false, error: "Survey not found" };
    }

    const permission = await getSurveyPermissionForSession(
      session,
      existingSurvey.id,
    );
    if (!hasSurveyPermission(permission, "canEdit") || !permission.isSurveyCreator) {
      return {
        success: false,
        error: "Unauthorized: Only the creator can duplicate this survey",
      };
    }

    const newSurveyId = nanoid();
    const now = new Date();

    let newSurvey: typeof surveys.$inferSelect | undefined;
    await getDb().transaction(async (tx) => {
      [newSurvey] = await tx
        .insert(surveys)
        .values({
          ...existingSurvey,
          id: newSurveyId,
          userId: session.user.id,
          title: `${existingSurvey.title || "Untitled Survey"} (Copy)`,
          status: "draft",
          confirmed: false,
          currentParticipants: 0,
          shareableLink: null,
          customSlug: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

    });

    if (!newSurvey) {
      return { success: false, error: "Failed to duplicate survey" };
    }

    // Map to frontend format (similar to what GET /api/surveys returns)
    const formattedSurvey = {
      id: newSurvey.id,
      title: newSurvey.title || "Untitled Survey",
      description:
        newSurvey.description || newSurvey.coreObjective || "",
      status: newSurvey.status,
      shareableLink: newSurvey.shareableLink,
      responses: newSurvey.currentParticipants,
      completionRate: 0,
      createdAt: newSurvey.createdAt?.toISOString().split("T")[0] || "",
      lastResponse: "Never",
      isOwner: true,
      isVoice: newSurvey.isVoice || false,
    };

    await invalidateDashboardCaches(
      session.user.id,
      null,
      ["stats", "recentSurveys"],
    );



    return {
      success: true,
      data: { id: newSurveyId, survey: formattedSurvey },
    };
  } catch (error) {
    console.error("Error duplicating survey:", error);
    return { success: false, error: "Failed to duplicate survey" };
  }
}
