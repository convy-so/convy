"use server";

import { nanoid } from "nanoid";
import { z } from "zod";
import { and, eq, ne, or, sql, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys, users, organizations, surveyEditors } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyPermissionContext,
  getSurveyPermissionForSession,
  hasSurveyPermission,
  isWorkspaceMember,
  isWorkspaceOwner,
} from "@/lib/workspace-access";
import { invalidateDashboardCaches } from "@/lib/cache";
import { env } from "@/lib/env";
import {
  recordRealtimeEvent,
} from "@/lib/collaboration-service";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type SurveyPermission = NonNullable<
  Awaited<ReturnType<typeof getSurveyPermissionContext>>
>;

/**
 * Schema for updating survey settings
 * Note: Auto-generated fields (goal, type, information, requiredQuestions) cannot be manually edited
 * These are generated from the conversational creation flow
 */
const updateSurveySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  participantLimit: z
    .number()
    .int()
    .positive()
    .max(50, "Maximum participant limit is 50")
    .optional(),
  language: z.enum(["en", "fr", "de", "es", "it"]).optional(),
  // Note: goal, type, information, requiredQuestions, metrics are auto-generated
  // and should not be manually edited after creation
});

const transferSurveyOwnershipSchema = z.object({
  surveyId: z.string().min(1),
  newOwnerUserId: z.string().min(1),
});

/**
 * Update survey settings (only if it's in draft or sample_review status)
 * Note: This only allows updating basic settings like title and participant limit.
 * Survey content (goal, questions, metrics) is generated from the conversational creation flow
 * and cannot be manually edited. Use the conversational creation flow to make content changes.
 */
export async function updateSurveyAction(
  input: z.infer<typeof updateSurveySchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();
    const body = updateSurveySchema.parse(input);

    // Check if survey exists and belongs to user
    const [existingSurvey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.id));

    if (!existingSurvey) {
      return { success: false, error: "Survey not found" };
    }

    const permission = await getSurveyPermissionForSession(session, existingSurvey.id);
    if (!hasSurveyPermission(permission, "canEdit")) {
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

    await getDb().transaction(async (tx) => {
      await tx.update(surveys).set(updateData).where(eq(surveys.id, body.id));

      if (permission?.workspaceId) {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: permission.workspaceId,
          eventType: "workspace.survey_updated",
          actorId: session.user.id,
          payload: {
            workspaceId: permission.workspaceId,
            survey: {
              id: body.id,
              ...updateData,
            },
          },
        });
      }
    });

    await invalidateDashboardCaches(
      session.user.id,
      existingSurvey.organizationId,
    );

    return { success: true, data: { id: body.id } };
  } catch (error) {
    console.error("[updateSurveyAction] Failed:", error);
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
    const activeOrgId = session.session.activeOrganizationId;

    if (activeOrgId) {
      const workspaceSurveys = await getDb()
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
        .where(eq(surveys.organizationId, activeOrgId))
        .orderBy(surveys.createdAt);

      const permissionEntries = await Promise.all(
        workspaceSurveys.map(async (survey) => ({
          surveyId: survey.id,
          permission: await getSurveyPermissionContext(session.user.id, survey.id, {
            activeWorkspaceId: activeOrgId,
          }),
        })),
      );
      const permissionBySurveyId = new Map<string, SurveyPermission>();
      for (const entry of permissionEntries) {
        if (entry.permission) {
          permissionBySurveyId.set(entry.surveyId, entry.permission);
        }
      }

      return {
        success: true,
        data: workspaceSurveys.flatMap((survey) => {
            const permission = permissionBySurveyId.get(survey.id);

            if (!hasSurveyPermission(permission, "canView")) {
              return [];
            }

            return [{
              ...survey,
              accessLevel: permission.accessLevel,
              canOpen: permission.canView,
              canEdit: permission.canEdit,
            }];
          }),
      };
    } else {
      // Personal context: Get only user's personal surveys (no organizationId)
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
        .where(
          and(
            eq(surveys.userId, session.user.id),
            isNull(surveys.organizationId),
          ),
        )
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
    }
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

    await getDb().transaction(async (tx) => {
      await tx
        .update(surveys)
        .set({
          status: "active",
          shareableLink,
        })
        .where(eq(surveys.id, surveyId));

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.published",
        actorId: session.user.id,
        payload: {
          surveyId,
          status: "active",
          shareableLink,
        },
      });

      if (permission.workspaceId) {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: permission.workspaceId,
          eventType: "workspace.survey_updated",
          actorId: session.user.id,
          payload: {
            workspaceId: permission.workspaceId,
            survey: {
              id: surveyId,
              status: "active",
              shareableLink,
            },
          },
        });
      }
    });

    await invalidateDashboardCaches(session.user.id, survey.organizationId, [
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

    await invalidateDashboardCaches(session.user.id, survey.organizationId, [
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

    await invalidateDashboardCaches(session.user.id, survey.organizationId, [
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
 * Removes survey and all related data (cascade). Notifies workspace members.
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
        organizationId: surveys.organizationId,
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
        error:
          "Unauthorized: Only the survey creator or workspace owner can delete this survey",
      };
    }

    const surveyTitle = survey.title;
    const organizationId = survey.organizationId;

    await getDb().transaction(async (tx) => {
      if (permission.workspaceId) {
        await recordRealtimeEvent(tx, {
          scope: "survey",
          surveyId,
          workspaceId: permission.workspaceId,
          eventType: "survey.deleting",
          actorId: session.user.id,
          payload: {
            surveyId,
            title: surveyTitle,
          },
        });
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: permission.workspaceId,
          eventType: "workspace.survey_deleted",
          actorId: session.user.id,
          payload: {
            workspaceId: permission.workspaceId,
            surveyId,
            title: surveyTitle,
          },
        });
      }

      await tx.delete(surveys).where(eq(surveys.id, surveyId));
    });

    await invalidateDashboardCaches(session.user.id, survey.organizationId);

    if (organizationId) {
      try {
        const { getWorkspaceMembers } = await import("@/app/actions/workspace");
        const { sendSurveyDeletedEmail } = await import("@/lib/email");

        const membersResult = await getWorkspaceMembers({ organizationId });
        if (!membersResult.success) {
          console.error(
            "[Survey Action] Failed to load workspace members for survey deletion notifications:",
            membersResult.error,
          );
        } else {
          const [org] = await getDb()
            .select({ name: organizations.name })
            .from(organizations)
            .where(eq(organizations.id, organizationId));

          const workspaceName = org?.name || "Workspace";
          const notificationResults = await Promise.allSettled(
            membersResult.data.flatMap((member) =>
              member.user.email
                ? [
                    sendSurveyDeletedEmail({
                      email: member.user.email,
                      surveyTitle,
                      deletedBy: session.user.name || session.user.email,
                      workspaceName,
                    }),
                  ]
                : [],
            ),
          );

          const failedNotifications = notificationResults.filter(
            (result) => result.status === "rejected",
          );
          if (failedNotifications.length > 0) {
            console.error(
              `[Survey Action] Failed to enqueue ${failedNotifications.length} survey deletion notifications for survey ${surveyId}.`,
            );
          }
        }
      } catch (error) {
        console.error(
          "[Survey Action] Failed to enqueue survey deletion notifications:",
          error,
        );
      }
    }

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

      if (existingSurvey.organizationId && newSurvey) {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: existingSurvey.organizationId,
          eventType: "workspace.survey_created",
          actorId: session.user.id,
          payload: {
            workspaceId: existingSurvey.organizationId,
            survey: {
              id: newSurvey.id,
              title: newSurvey.title,
              status: newSurvey.status,
              userId: newSurvey.userId,
              isVoice: newSurvey.isVoice,
              createdAt: newSurvey.createdAt?.toISOString() ?? now.toISOString(),
            },
          },
        });
      }
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
      existingSurvey.organizationId,
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

export async function transferSurveyOwnershipAction(input: {
  surveyId: string;
  newOwnerUserId: string;
}): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();
    const body = transferSurveyOwnershipSchema.parse(input);

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (!survey.organizationId) {
      return {
        success: false,
        error: "Survey ownership transfer is only supported in workspaces",
      };
    }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canDelete")) {
      return { success: false, error: "Unauthorized" };
    }

    const targetIsMember = await isWorkspaceMember(
      body.newOwnerUserId,
      survey.organizationId,
    );
    if (!targetIsMember) {
      return {
        success: false,
        error: "New owner must be a member of the workspace",
      };
    }

    if (survey.userId === body.newOwnerUserId) {
      return { success: false, error: "This user already owns the survey" };
    }

    const canTransfer =
      permission.isSurveyCreator ||
      (survey.organizationId &&
        (await isWorkspaceOwner(session.user.id, survey.organizationId)));
    if (!canTransfer) {
      return { success: false, error: "Unauthorized" };
    }

    await getDb().transaction(async (tx) => {
      await tx
        .update(surveys)
        .set({ userId: body.newOwnerUserId, updatedAt: new Date() })
        .where(eq(surveys.id, body.surveyId));

      await tx
        .delete(surveyEditors)
        .where(
          and(
            eq(surveyEditors.surveyId, body.surveyId),
            eq(surveyEditors.userId, body.newOwnerUserId),
          ),
        );

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId: body.surveyId,
        workspaceId: survey.organizationId,
        eventType: "survey.editor_revoked",
        actorId: session.user.id,
        payload: {
          surveyId: body.surveyId,
          userId: body.newOwnerUserId,
          reason: "ownership_transferred",
        },
      });
      await recordRealtimeEvent(tx, {
        scope: "workspace",
        workspaceId: survey.organizationId,
        eventType: "workspace.survey_updated",
        actorId: session.user.id,
        payload: {
          workspaceId: survey.organizationId,
          survey: {
            id: body.surveyId,
            userId: body.newOwnerUserId,
          },
        },
      });
    });

    await invalidateDashboardCaches(session.user.id, survey.organizationId, [
      "stats",
      "recentSurveys",
    ]);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("[transferSurveyOwnershipAction] Failed:", error);
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
    }
    return { success: false, error: "Failed to transfer survey ownership" };
  }
}


