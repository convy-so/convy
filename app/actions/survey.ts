"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { and, eq, ne, or, sql, isNull } from "drizzle-orm";

import { db } from "@/db";
import { surveys, users, organizations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getSurveyAccessLevel } from "@/lib/workspace-access";
import { env } from "@/lib/env";
import {
  assertCanUseCustomUrl,
  assertCanUseEmbedWidget,
  PlanLimitError,
} from "@/lib/billing/entitlements";

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

    const access = await getSurveyAccessLevel(session.user.id, existingSurvey.id);
    if (access !== "owner" && access !== "editor") {
      return { success: false, error: "Unauthorized: Editor access required" };
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
      projectId: string | null;
      creatorName: string | null;
      isOwner: boolean;
      isVoice: boolean;
    }>
  >
> {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      // Workspace context: Get all surveys in the workspace
      const workspaceSurveys = await db
        .select({
          id: surveys.id,
          title: surveys.title,
          status: surveys.status,
          createdAt: surveys.createdAt,
          currentParticipants: surveys.currentParticipants,
          participantLimit: surveys.participantLimit,
          shareableLink: surveys.shareableLink,
          projectId: surveys.projectId,
          creatorName: users.name,
          isOwner: sql<boolean>`${surveys.userId} = ${session.user.id}`,
          isVoice: surveys.isVoice,
        })
        .from(surveys)
        .leftJoin(users, eq(surveys.userId, users.id))
        .where(eq(surveys.organizationId, activeOrgId))
        .orderBy(surveys.createdAt);

      return { success: true, data: workspaceSurveys };
    } else {
      // Personal context: Get only user's personal surveys (no organizationId)
      const personalSurveys = await db
        .select({
          id: surveys.id,
          title: surveys.title,
          status: surveys.status,
          createdAt: surveys.createdAt,
          currentParticipants: surveys.currentParticipants,
          participantLimit: surveys.participantLimit,
          shareableLink: surveys.shareableLink,
          projectId: surveys.projectId,
          creatorName: users.name,
          isOwner: sql<boolean>`${surveys.userId} = ${session.user.id}`,
          isVoice: surveys.isVoice,
        })
        .from(surveys)
        .leftJoin(users, eq(surveys.userId, users.id))
        .where(
          and(
            eq(surveys.userId, session.user.id),
            isNull(surveys.organizationId)
          )
        )
        .orderBy(surveys.createdAt);

      return { success: true, data: personalSurveys };
    }
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

    const accessLevel = await getSurveyAccessLevel(session.user.id, surveyId);

    if (accessLevel === "none") {
      return { success: false, error: "Unauthorized" };
    }

    // Access granted (owner or workspace-member)
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

    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access !== "owner" && access !== "editor") {
      return { success: false, error: "Unauthorized: Editor access required" };
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

    // Trigger Zapier Webhook (async)
    try {
      const { triggerSurveyCreatedWebhook } = await import("@/lib/zapier/webhook-delivery");
      triggerSurveyCreatedWebhook(surveyId, session.user.id).catch(console.error);
    } catch (e) {
      console.error("Failed to trigger Zapier webhook:", e);
    }

    // Enqueue Slack Auto-Post (via Notification Queue)
    try {
      const { enqueueNotification } = await import("@/lib/queue");
      await enqueueNotification({
        type: "slack",
        userId: session.user.id,
        message: "Survey Created",
        metadata: {
          event: "survey_created",
          surveyId,
        },
      });
    } catch (e) {
      console.error("Failed to enqueue Slack notification:", e);
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

    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access === "none") {
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
          "Slug can only contain lowercase letters, numbers, and hyphens"
        ),
    });

    const body = schema.parse(input);

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access !== "owner" && access !== "editor") {
      return { success: false, error: "Unauthorized" };
    }

    // Plan gating
    try {
      await assertCanUseCustomUrl({ userId: session.user.id });
    } catch (error) {
      if (error instanceof PlanLimitError) {
        return { success: false, error: error.message };
      }
      throw error;
    }

    // Check uniqueness against other surveys' customSlug and shareableLink
    const [conflict] = await db
      .select({ id: surveys.id })
      .from(surveys)
      .where(
        and(
          ne(surveys.id, survey.id),
          or(
            eq(surveys.customSlug, body.slug),
            eq(surveys.shareableLink, body.slug)
          )
        )
      );

    if (conflict) {
      return {
        success: false,
        error: "This URL is already in use by another survey",
      };
    }

    await db
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
  surveyId: string
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access !== "owner" && access !== "editor") {
      return { success: false, error: "Unauthorized" };
    }

    await db
      .update(surveys)
      .set({ customSlug: null })
      .where(eq(surveys.id, survey.id));

    return { success: true, data: { success: true } };
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
    return { success: false, error: "Failed to clear custom URL" };
  }
}

/**
 * Get public URLs for a survey (default random link + optional custom slug)
 */
export async function getSurveyPublicUrlsAction(
  surveyId: string
): Promise<
  ActionResult<{
    shareableLink: string | null;
    shareableUrl: string | null;
    customSlug: string | null;
    customUrl: string | null;
  }>
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

    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access === "none") {
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
 * Generate embeddable widget code (Typeform-style iframe) for a survey.
 * This does not create any UI route; it only returns HTML snippets your
 * frontend can display to users on eligible plans.
 */
export async function getSurveyEmbedCodeAction(
  surveyId: string
): Promise<
  ActionResult<{
    iframeCode: string;
    inlineScriptSnippet: string;
    url: string;
  }>
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

    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access === "none") {
      return { success: false, error: "Unauthorized" };
    }

    if (survey.status !== "active") {
      return {
        success: false,
        error: "Survey must be active to generate an embed widget",
      };
    }

    // Plan gating
    try {
      await assertCanUseEmbedWidget({ userId: session.user.id });
    } catch (error) {
      if (error instanceof PlanLimitError) {
        return { success: false, error: error.message };
      }
      throw error;
    }

    const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");

    const identifier = survey.customSlug ?? survey.shareableLink;

    if (!identifier) {
      return {
        success: false,
        error: "Survey does not have a public link yet",
      };
    }

    const url = `${baseUrl}/s/${identifier}`;

    const iframeCode = `<iframe src="${url}" width="100%" height="600" frameborder="0" style="border:0;" allow="microphone; camera; autoplay; encrypted-media"></iframe>`;

    const inlineScriptSnippet = `<script>
  (function() {
    var iframe = document.createElement('iframe');
    iframe.src = '${url}';
    iframe.style.width = '100%';
    iframe.style.height = '600px';
    iframe.style.border = '0';
    iframe.allow = 'microphone; camera; autoplay; encrypted-media';
    var container = document.currentScript.parentElement;
    container.appendChild(iframe);
  })();
</script>`;

    return {
      success: true,
      data: {
        iframeCode,
        inlineScriptSnippet,
        url,
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
    return { success: false, error: "Failed to generate embed code" };
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

    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access !== "owner" && access !== "editor") {
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

    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access !== "owner" && access !== "editor") {
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

/**
 * Delete a survey (Creator ONLY)
 * Removes survey and all related data (cascade). Notifies workspace members.
 */
export async function deleteSurveyAction(
  surveyId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();

    const [survey] = await db
      .select({
        id: surveys.id,
        title: surveys.title,
        userId: surveys.userId,
        organizationId: surveys.organizationId,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    // Strict Rule: Only the Creator can delete
    if (survey.userId !== session.user.id) {
      return {
        success: false,
        error: "Unauthorized: Only the survey creator can delete this survey",
      };
    }

    // Capture details for notification before deletion
    const surveyTitle = survey.title;
    const organizationId = survey.organizationId;

    // Delete survey (Waterfall cascade deletes everything else)
    await db.delete(surveys).where(eq(surveys.id, surveyId));

    // Send Notifications if in a workspace
    if (organizationId) {
      // We run this asynchronously to not block the UI response
      (async () => {
        try {
          const { getWorkspaceMembers } = await import("@/app/actions/workspace");
          const { sendSurveyDeletedEmail } = await import("@/lib/email");

          const membersResult = await getWorkspaceMembers({ organizationId });
          
          const [org] = await db
            .select({ name: organizations.name })
            .from(organizations)
            .where(eq(organizations.id, organizationId));
             
          const workspaceName = org?.name || "Workspace";

          if (membersResult.success) {
            for (const member of membersResult.data) {
              if (member.user.email) {
                 await sendSurveyDeletedEmail({
                   email: member.user.email,
                   surveyTitle,
                   deletedBy: session.user.name || session.user.email,
                   workspaceName,
                 });
              }
            }
          }
        } catch (e) {
          console.error("Failed to send delete notifications:", e);
        }
      })();
    }

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
    return { success: false, error: "Failed to delete survey" };
  }
}
