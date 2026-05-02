import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";

/**
 * DELETE - Delete a survey
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canDelete")) { return apiError("UNAUTHORIZED", "Unauthorized. You do not have permission to delete this survey."); }

    const [survey] = await getDb()
      .select({
        id: surveys.id,
        title: surveys.title,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

    await getDb().delete(surveys).where(eq(surveys.id, surveyId));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) { return apiError("UNAUTHENTICATED", error.message); } return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]:delete");
  }
}

/**
 * PATCH - Update survey settings
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) { return apiError("UNAUTHORIZED", "Unauthorized. Only the creator and approved editors can modify surveys."); }

    // Fetch survey for updates
    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

    // Validate allowed fields (basic validation)
    const updates: Partial<typeof survey> = {};
    if (typeof body.title === "string") updates.title = body.title;
    if (
      typeof body.participantLimit === "number" ||
      typeof body.participantLimit === "string"
    ) {
      updates.participantLimit = Math.min(Number(body.participantLimit), 50);
    }
    if (["en", "fr", "de", "es", "it"].includes(body.language)) {
      updates.language = body.language;
    }

    if (typeof body.isVoice === "boolean") {
      // If turning on voice, check limit
      if (body.isVoice && !survey.isVoice) {
        const existingVoiceSurveys = await getDb()
          .select({ id: surveys.id })
          .from(surveys)
          .where(
            and(
              eq(surveys.userId, session.user.id),
              eq(surveys.isVoice, true),
            ),
          );

        if (existingVoiceSurveys.length >= 2) { return apiError("UNAUTHORIZED", "Limit reached: You can only have 2 voice surveys in your account"); }
      }
      updates.isVoice = body.isVoice;
    }

    if (Object.keys(updates).length === 0) { return apiError("VALIDATION_ERROR", "No valid fields to update"); }

    // Update survey
    await getDb()
      .update(surveys)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(surveys.id, surveyId));

    return NextResponse.json({ success: true, updates });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) { return apiError("UNAUTHENTICATED", error.message); } return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]:patch");
  }
}


