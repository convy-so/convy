"use server";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import {
  assertState,
  withErrorHandling,
  type ActionResult,
} from "@/lib/action-wrapper";

import {
  buildSurveyPublicPath,
  invalidateSurveyCaches,
  requireSurveyActionSession,
  requireSurveyWithPermission,
} from "./shared";

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
    const session = await requireSurveyActionSession();
    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId,
      capability: "canPublish",
      message: "Editor access required to publish survey",
    });

    assertState(
      survey.status === "sample_review" || survey.status === "draft",
      "Survey must be in draft or sample_review status to confirm",
    );

    const { getResearchBrief } = await import("@/lib/education/storage");
    const briefRow = await getResearchBrief(surveyId);
    assertState(
      !!briefRow?.brief,
      "Survey is missing a canonical research brief. Please complete the creation workflow.",
    );

    if (survey.status === "sample_review") {
      assertState(
        survey.confirmed,
        "Please confirm at least one sample conversation before activating the survey",
      );
    }

    const shareableLink = survey.shareableLink ?? `survey-${nanoid(12)}`;

    await getDb()
      .update(surveys)
      .set({
        status: "active",
        shareableLink,
      })
      .where(eq(surveys.id, surveyId));

    await invalidateSurveyCaches(session.user.id, ["recentSurveys"]);

    return {
      success: true,
      data: {
        id: surveyId,
        shareableLink,
        publicUrl: buildSurveyPublicPath(shareableLink),
      },
    };
  }, "confirmSurveyAction");
}

/**
 * Deactivate a survey (pause it from receiving new responses)
 */
export async function deactivateSurveyAction(
  surveyId: string,
): Promise<ActionResult<{ id: string }>> {
  return withErrorHandling(async () => {
    const session = await requireSurveyActionSession();
    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId,
      capability: "canEdit",
      message: "Unauthorized",
    });

    assertState(survey.status === "active", "Survey is not active");

    await getDb()
      .update(surveys)
      .set({ status: "completed" })
      .where(eq(surveys.id, surveyId));

    await invalidateSurveyCaches(session.user.id, ["stats", "recentSurveys"]);

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
    const session = await requireSurveyActionSession();
    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId,
      capability: "canEdit",
      message: "Unauthorized",
    });

    assertState(survey.status === "completed", "Survey is not completed");
    assertState(
      survey.currentParticipants < survey.participantLimit,
      "Survey has reached participant limit. Increase the limit to reactivate.",
    );

    await getDb()
      .update(surveys)
      .set({ status: "active" })
      .where(eq(surveys.id, surveyId));

    await invalidateSurveyCaches(session.user.id, ["stats", "recentSurveys"]);

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
    const session = await requireSurveyActionSession();
    await requireSurveyWithPermission({
      session,
      surveyId,
      capability: "canDelete",
      message: "Unauthorized: Only the survey creator can delete this survey",
    });

    await getDb().delete(surveys).where(eq(surveys.id, surveyId));
    await invalidateSurveyCaches(session.user.id);

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
    const session = await requireSurveyActionSession();
    const { survey: existingSurvey, permission } = await requireSurveyWithPermission({
      session,
      surveyId,
      capability: "canEdit",
      message: "Unauthorized: Only the creator can duplicate this survey",
    });

    assertState(
      permission.isSurveyCreator,
      "Unauthorized: Only the creator can duplicate this survey",
    );

    const newSurveyId = nanoid();
    const now = new Date();

    const [newSurvey] = await getDb()
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

    assertState(!!newSurvey, "Failed to duplicate survey");

    await invalidateSurveyCaches(session.user.id, ["stats", "recentSurveys"]);

    return {
      success: true,
      data: {
        id: newSurveyId,
        survey: {
          id: newSurvey.id,
          title: newSurvey.title || "Untitled Survey",
          description: newSurvey.description || newSurvey.coreObjective || "",
          status: newSurvey.status,
          shareableLink: newSurvey.shareableLink,
          responses: newSurvey.currentParticipants,
          completionRate: 0,
          createdAt: newSurvey.createdAt?.toISOString().split("T")[0] || "",
          lastResponse: "Never",
          isOwner: true,
          isVoice: newSurvey.isVoice || false,
        },
      },
    };
  }, "duplicateSurveyAction");
}
