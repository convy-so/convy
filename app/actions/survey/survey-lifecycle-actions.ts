"use server";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb } from "@/db";
import { surveyCreationConversations, surveys } from "@/db/schema";
import {
  assertState,
  validateInput,
  withErrorHandling,
  type ActionResult,
} from "@/lib/action-wrapper";
import { SURVEY_LIMITS } from "@/lib/config";
import { env } from "@/lib/env";
import { createSurveyForUser } from "@/lib/surveys/surveys-route-service";
import { createSurveySchema } from "@/lib/validation/survey-schemas";
import { scheduleAnalyticsRefresh } from "@/lib/analytics-scheduler";

import {
  invalidateSurveyCaches,
  requireSurveyActionSession,
  requireSurveyWithPermission,
} from "./shared";
import { buildSurveyPublicPath } from "@/lib/surveys/utils";
import {
  getActiveConductingProfile,
  getActiveCoveragePlan,
  getResearchBrief,
  replaceConductingProfile,
} from "@/lib/education/storage";

async function activateSurveyWithCanonicalData(params: {
  surveyId: string;
  survey: typeof surveys.$inferSelect;
  titleOverride?: string;
  descriptionOverride?: string;
  isVoiceOverride?: boolean;
}) {
  const { surveyId, survey, titleOverride, descriptionOverride, isVoiceOverride } = params;

  assertState(
    survey.status === "sample_review" || survey.status === "draft",
    "Survey must be in draft or sample_review status to activate",
  );

  const [briefRow, planRow] = await Promise.all([
    getResearchBrief(surveyId),
    getActiveCoveragePlan(surveyId),
  ]);

  assertState(!!briefRow && !!planRow, "The education brief is not ready yet.");
  assertState(
    briefRow.missingFields.length === 0,
    "The brief is incomplete.",
  );

  if (survey.status === "sample_review") {
    assertState(
      survey.confirmed,
      "Please confirm at least one sample conversation before activating the survey",
    );
  }

  const activeSampleProfile = await getActiveConductingProfile(surveyId, "sample");
  if (activeSampleProfile?.profile) {
    await replaceConductingProfile({
      surveyId,
      mode: "live",
      sourcePatchId: activeSampleProfile.sourcePatchId,
      profile: {
        ...activeSampleProfile.profile,
        mode: "live",
        version: activeSampleProfile.profile.version,
        createdAt: new Date().toISOString(),
      },
    });
  }

  const shareableLink = survey.shareableLink ?? nanoid(10);
  const title = titleOverride?.trim() || survey.title || briefRow.brief.title;
  const description =
    descriptionOverride?.trim() ||
    survey.description ||
    briefRow.brief.learningContext;

  await getDb()
    .update(surveys)
    .set({
      status: "active",
      shareableLink,
      title,
      description,
      coreObjective: briefRow.brief.researchGoal,
      programId: briefRow.programId,
      isVoice: isVoiceOverride ?? survey.isVoice,
      updatedAt: new Date(),
    })
    .where(eq(surveys.id, surveyId));

  const publicUrl = buildSurveyPublicPath(shareableLink);
  return {
    id: surveyId,
    shareableLink,
    publicUrl,
    shareUrl: `${env.APP_BASE_URL.replace(/\/+$/, "")}${publicUrl}`,
    title,
    description,
  };
}

export async function createSurveyDraftAction(
  input: unknown,
): Promise<
  ActionResult<{
    id: string;
    title: string;
    deliveryMode: "link" | "classroom_assigned";
    classroomId: string | null;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      parts: Array<{ type: "text"; text: string }>;
      timestamp: string;
    }>;
  }>
> {
  return withErrorHandling(async () => {
    const session = await requireSurveyActionSession();
    const body = validateInput(input, createSurveySchema);

    const existingSurveys = await getDb()
      .select({ id: surveys.id, isVoice: surveys.isVoice })
      .from(surveys)
      .where(eq(surveys.userId, session.user.id));

    assertState(
      existingSurveys.length < SURVEY_LIMITS.MAX_SURVEYS_PER_SCOPE,
      `Limit reached: You can only have ${SURVEY_LIMITS.MAX_SURVEYS_PER_SCOPE} surveys in your account`,
    );
    assertState(
      !body.isVoice ||
        existingSurveys.filter((item) => item.isVoice).length <
          SURVEY_LIMITS.MAX_VOICE_SURVEYS_PER_SCOPE,
      `Limit reached: You can only have ${SURVEY_LIMITS.MAX_VOICE_SURVEYS_PER_SCOPE} voice surveys in your account`,
    );

    const { createdSurvey } = await createSurveyForUser({
      session,
      body: {
        deliveryMode: body.deliveryMode ?? "link",
        classroomId: body.classroomId ?? null,
        language: body.language,
        isVoice: body.isVoice ?? false,
      },
    });

    assertState(!!createdSurvey, "Failed to create survey draft");
    await invalidateSurveyCaches(session.user.id, ["recentSurveys", "stats"]);

    return {
      success: true,
      data: {
        id: createdSurvey.id,
        title: createdSurvey.title ?? "Untitled Survey",
        deliveryMode: createdSurvey.deliveryMode as "link" | "classroom_assigned",
        classroomId: createdSurvey.classroomId,
        messages: [],
      },
    };
  }, "createSurveyDraftAction");
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
    const session = await requireSurveyActionSession();
    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId,
      capability: "canPublish",
      message: "Editor access required to publish survey",
    });
    const activatedSurvey = await activateSurveyWithCanonicalData({
      surveyId,
      survey,
    });

    await invalidateSurveyCaches(session.user.id, ["recentSurveys"]);

    return {
      success: true,
      data: {
        id: activatedSurvey.id,
        shareableLink: activatedSurvey.shareableLink,
        publicUrl: activatedSurvey.publicUrl,
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

export async function setSurveyStatusAction(
  input: unknown,
): Promise<ActionResult<{ id: string; status: "active" | "paused" }>> {
  return withErrorHandling(async () => {
    const session = await requireSurveyActionSession();
    const body = validateInput(
      input,
      z.object({
        surveyId: z.string().min(1),
        status: z.enum(["active", "paused"]),
      }),
    );

    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId: body.surveyId,
      capability: "canEdit",
      message: "Unauthorized",
    });

    if (body.status === "active") {
      assertState(
        survey.currentParticipants < survey.participantLimit,
        "Survey has reached participant limit. Increase the limit to reactivate.",
      );
    }

    await getDb()
      .update(surveys)
      .set({
        status: body.status,
        updatedAt: new Date(),
      })
      .where(eq(surveys.id, body.surveyId));

    await invalidateSurveyCaches(session.user.id, ["stats", "recentSurveys"]);

    return {
      success: true,
      data: { id: body.surveyId, status: body.status },
    };
  }, "setSurveyStatusAction");
}

export async function publishSurveyAction(
  input: unknown,
): Promise<
  ActionResult<{
    id: string;
    shareableLink: string;
    shareUrl: string;
    publicUrl: string;
    title: string;
    description: string;
  }>
> {
  return withErrorHandling(async () => {
    const session = await requireSurveyActionSession();
    const body = validateInput(
      input,
      z.object({
        surveyId: z.string().min(1),
        title: z.string().trim().min(1).optional(),
        description: z.string().optional().default(""),
        isVoice: z.boolean().optional(),
      }),
    );

    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId: body.surveyId,
      capability: "canPublish",
      message: "Unauthorized",
    });
    const activatedSurvey = await activateSurveyWithCanonicalData({
      surveyId: body.surveyId,
      survey,
      titleOverride: body.title,
      descriptionOverride: body.description,
      isVoiceOverride: body.isVoice,
    });

    await invalidateSurveyCaches(session.user.id, ["recentSurveys", "stats"]);

    return {
      success: true,
      data: {
        id: activatedSurvey.id,
        shareableLink: activatedSurvey.shareableLink,
        publicUrl: activatedSurvey.publicUrl,
        shareUrl: activatedSurvey.shareUrl,
        title: activatedSurvey.title,
        description: activatedSurvey.description,
      },
    };
  }, "publishSurveyAction");
}

export async function finalizeSurveyCreationAction(
  surveyId: string,
): Promise<ActionResult<{ id: string; status: "sample_review" }>> {
  return withErrorHandling(async () => {
    const session = await requireSurveyActionSession();
    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId,
      capability: "canEdit",
      message: "Unauthorized",
    });

    assertState(
      survey.status === "creating",
      "Survey has already been finalized",
    );

    const [briefRow, planRow] = await Promise.all([
      getResearchBrief(surveyId),
      getActiveCoveragePlan(surveyId),
    ]);
    assertState(!!briefRow && !!planRow, "The education brief is not ready yet.");
    assertState(
      briefRow.missingFields.length === 0,
      "The brief is incomplete.",
    );

    await getDb()
      .update(surveys)
      .set({
        status: "sample_review",
        title: briefRow.brief.title,
        description: briefRow.brief.learningContext,
        coreObjective: briefRow.brief.researchGoal,
        programId: briefRow.programId,
        updatedAt: new Date(),
      })
      .where(eq(surveys.id, surveyId));

    await getDb()
      .update(surveyCreationConversations)
      .set({
        status: "completed",
        extractedData: {
          programId: briefRow.programId,
          brief: briefRow.brief,
          coveragePlan: planRow.plan,
          readyForSampling: true,
        },
        updatedAt: new Date(),
      })
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    await invalidateSurveyCaches(session.user.id, ["recentSurveys", "stats"]);

    return { success: true, data: { id: surveyId, status: "sample_review" } };
  }, "finalizeSurveyCreationAction");
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

export async function refreshSurveyAnalyticsAction(
  input: unknown,
): Promise<ActionResult<{ surveyId: string; status: "queued" }>> {
  return withErrorHandling(async () => {
    const session = await requireSurveyActionSession();
    const body = validateInput(
      input,
      z.object({
        surveyId: z.string().min(1),
      }),
    );

    await requireSurveyWithPermission({
      session,
      surveyId: body.surveyId,
      capability: "canEdit",
      message: "Unauthorized. Only owners and editors can trigger analytics.",
    });

    await scheduleAnalyticsRefresh({
      surveyId: body.surveyId,
      userId: session.user.id,
      force: true,
    });

    await invalidateSurveyCaches(session.user.id, ["stats"]);

    return {
      success: true,
      data: {
        surveyId: body.surveyId,
        status: "queued",
      },
    };
  }, "refreshSurveyAnalyticsAction");
}
