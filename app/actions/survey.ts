"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { and, eq, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys, users } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";
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
      accessLevel: "owner" | "none";
      canOpen: boolean;
      canEdit: boolean;
    }>
  >
> {
  return withErrorHandling(async () => {
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
  }, "getSurveysAction");
}

/**
 * Get a single survey by ID
 */
export async function getSurveyAction(
  surveyId: string,
): Promise<ActionResult<typeof surveys.$inferSelect>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    assertExists(survey, "Survey");

    const permission = await getSurveyPermissionForSession(session, surveyId);
    assertPermission(hasSurveyPermission(permission, "canView"), "Unauthorized");

    // Access granted for the survey owner
    return { success: true, data: survey };
  }, "getSurveyAction");
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
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    assertExists(survey, "Survey");

    const permission = await getSurveyPermissionForSession(session, survey.id);
    assertPermission(hasSurveyPermission(permission, "canPublish"), "Editor access required to publish survey");

    // Allow confirmation from either draft or sample_review status
    assertState(survey.status === "sample_review" || survey.status === "draft", "Survey must be in draft or sample_review status to confirm");

    const { getResearchBrief } = await import("@/lib/education/storage");
    const briefRow = await getResearchBrief(surveyId);
    assertState(!!briefRow?.brief, "Survey is missing a canonical research brief. Please complete the creation workflow.");

    if (survey.status === "sample_review") {
      assertState(survey.confirmed, "Please confirm at least one sample conversation before activating the survey");
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
  }, "confirmSurveyAction");
}

/**
 * Get the shareable link for a survey
 */
export async function getShareableLinkAction(
  surveyId: string,
): Promise<
  ActionResult<{ shareableLink: string; publicUrl: string; isActive: boolean }>
> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    assertExists(survey, "Survey");

    const permission = await getSurveyPermissionForSession(session, survey.id);
    assertPermission(hasSurveyPermission(permission, "canView"), "Unauthorized");

    assertState(!!survey.shareableLink, "Survey does not have a shareable link yet");

    return {
      success: true,
      data: {
        shareableLink: survey.shareableLink,
        publicUrl: `/s/${survey.shareableLink}`,
        isActive: survey.status === "active",
      },
    };
  }, "getShareableLinkAction");
}

/**
 * Set or update a human-friendly custom slug for a survey
 * (Typeform-style custom URL). Gated by plan entitlements.
 */
export async function setSurveyCustomSlugAction(input: unknown): Promise<
  ActionResult<{ customSlug: string; publicUrl: string; shareableLink: string }>
> {
  return withErrorHandling(async () => {
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

    const body = validateInput(input, schema);

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

    assertExists(survey, "Survey");

    const permission = await getSurveyPermissionForSession(session, survey.id);
    assertPermission(hasSurveyPermission(permission, "canEdit"), "Unauthorized");

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

    assertState(!conflict, "This URL is already in use by another survey");

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
  }, "setSurveyCustomSlugAction");
}

/**
 * Clear the custom slug for a survey, falling back to random shareable link
 */
export async function clearSurveyCustomSlugAction(
  surveyId: string,
): Promise<ActionResult<{ success: boolean }>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    assertExists(survey, "Survey");

    const permission = await getSurveyPermissionForSession(session, survey.id);
    assertPermission(hasSurveyPermission(permission, "canEdit"), "Unauthorized");

    await getDb()
      .update(surveys)
      .set({ customSlug: null })
      .where(eq(surveys.id, survey.id));

    return { success: true, data: { success: true } };
  }, "clearSurveyCustomSlugAction");
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
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    assertExists(survey, "Survey");

    const permission = await getSurveyPermissionForSession(session, survey.id);
    assertPermission(hasSurveyPermission(permission, "canView"), "Unauthorized");

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
  }, "getSurveyPublicUrlsAction");
}

/**
 * Deactivate a survey (pause it from receiving new responses)
 */
export async function deactivateSurveyAction(
  surveyId: string,
): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    assertExists(survey, "Survey");

    const permission = await getSurveyPermissionForSession(session, survey.id);
    assertPermission(hasSurveyPermission(permission, "canEdit"), "Unauthorized");

    assertState(survey.status === "active", "Survey is not active");

    await getDb()
      .update(surveys)
      .set({ status: "completed" })
      .where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, null, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: { id: surveyId } };
  }, "deactivateSurveyAction");
}

/**
 * Reactivate a completed survey
 */
export async function reactivateSurveyAction(
  surveyId: string,
): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    assertExists(survey, "Survey");

    const permission = await getSurveyPermissionForSession(session, survey.id);
    assertPermission(hasSurveyPermission(permission, "canEdit"), "Unauthorized");

    assertState(survey.status === "completed", "Survey is not completed");
    assertState(survey.currentParticipants < survey.participantLimit, "Survey has reached participant limit. Increase the limit to reactivate.");

    await getDb()
      .update(surveys)
      .set({ status: "active" })
      .where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, null, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: { id: surveyId } };
  }, "reactivateSurveyAction");
}

/**
 * Delete a survey (Creator ONLY)
 * Removes survey and all related data (cascade).
 */
export async function deleteSurveyAction(
  surveyId: string,
): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();

    const [survey] = await getDb()
      .select({
        id: surveys.id,
        title: surveys.title,
        userId: surveys.userId,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    assertExists(survey, "Survey");

    const permission = await getSurveyPermissionForSession(session, surveyId);
    assertPermission(hasSurveyPermission(permission, "canDelete"), "Unauthorized: Only the survey creator can delete this survey");

    await getDb().delete(surveys).where(eq(surveys.id, surveyId));

    await invalidateDashboardCaches(session.user.id, null);

    return { success: true, data: { id: surveyId } };
  }, "deleteSurveyAction");
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
  return withErrorHandling(async () => {
    const session = await getVerifiedSession();

    const [existingSurvey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    assertExists(existingSurvey, "Survey");

    const permission = await getSurveyPermissionForSession(
      session,
      existingSurvey.id,
    );
    assertPermission(hasSurveyPermission(permission, "canEdit") && permission.isSurveyCreator, "Unauthorized: Only the creator can duplicate this survey");

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

    assertState(!!newSurvey, "Failed to duplicate survey");

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
  }, "duplicateSurveyAction");
}
