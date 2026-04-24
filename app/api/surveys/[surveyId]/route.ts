import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

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
    if (!hasSurveyPermission(permission, "canDelete")) {
      return NextResponse.json(
        { error: "Unauthorized. You do not have permission to delete this survey." },
        { status: 403 },
      );
    }

    const [survey] = await getDb()
      .select({
        id: surveys.id,
        title: surveys.title,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    await getDb().delete(surveys).where(eq(surveys.id, surveyId));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
    }
    console.error("Error deleting survey:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
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
    if (!hasSurveyPermission(permission, "canEdit")) {
      return NextResponse.json(
        { error: "Unauthorized. Only the creator and approved editors can modify surveys." },
        { status: 403 },
      );
    }

    // Fetch survey for updates
    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

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

        if (existingVoiceSurveys.length >= 2) {
          return NextResponse.json(
            {
              error:
                "Limit reached: You can only have 2 voice surveys in your account",
            },
            { status: 403 },
          );
        }
      }
      updates.isVoice = body.isVoice;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

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
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
    }
    console.error("Error updating survey:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
