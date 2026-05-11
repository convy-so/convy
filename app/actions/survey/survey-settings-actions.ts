"use server";

import { and, eq, ne, or } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import {
  assertState,
  validateInput,
  withErrorHandling,
  type ActionResult,
} from "@/lib/action-wrapper";
import {
  updateSurveySchema,
} from "@/lib/validation/survey-schemas";

import {
  buildSurveyPublicPath,
  invalidateSurveyCaches,
  requireSurveyActionSession,
  requireSurveyWithPermission,
} from "./shared";

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
    const session = await requireSurveyActionSession();
    const body = validateInput(input, updateSurveySchema);
    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId: body.id,
      capability: "canEdit",
      message: "Editor access required",
    });

    assertState(
      survey.status === "draft" || survey.status === "sample_review",
      "Cannot update survey in current status",
    );

    const updateData: Partial<typeof surveys.$inferInsert> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.participantLimit !== undefined) {
      updateData.participantLimit = body.participantLimit;
    }
    if (body.language !== undefined) updateData.language = body.language;

    await getDb().update(surveys).set(updateData).where(eq(surveys.id, body.id));
    await invalidateSurveyCaches(session.user.id);

    return { success: true, data: { id: body.id } };
  }, "updateSurveyAction");
}

/**
 * Set or update a human-friendly custom slug for a survey
 * (Typeform-style custom URL). Gated by plan entitlements.
 */
export async function setSurveyCustomSlugAction(
  input: unknown,
): Promise<
  ActionResult<{ customSlug: string; publicUrl: string; shareableLink: string }>
> {
  return withErrorHandling(async () => {
    const session = await requireSurveyActionSession();
    const body = validateInput(
      input,
      z.object({
        surveyId: z.string().min(1),
        slug: z
          .string()
          .min(3)
          .max(64)
          .regex(
            /^[a-z0-9-]+$/,
            "Slug can only contain lowercase letters, numbers, and hyphens",
          ),
      }),
    );

    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId: body.surveyId,
      capability: "canEdit",
      message: "Unauthorized",
    });

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

    return {
      success: true,
      data: {
        customSlug: body.slug,
        publicUrl: buildSurveyPublicPath(body.slug),
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
    const session = await requireSurveyActionSession();
    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId,
      capability: "canEdit",
      message: "Unauthorized",
    });

    await getDb()
      .update(surveys)
      .set({ customSlug: null })
      .where(eq(surveys.id, survey.id));

    return { success: true, data: { success: true } };
  }, "clearSurveyCustomSlugAction");
}
