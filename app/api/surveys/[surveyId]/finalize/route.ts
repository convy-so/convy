import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { mapSessionAuthError } from "@/lib/route-auth-error";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import { getDb } from "@/db";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canPublish")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

    if (survey.status !== "creating") { return apiError("VALIDATION_ERROR", "Survey is not in creation mode"); }

    // Generate shareable link if not exists
    let shareableLink = survey.shareableLink;
    if (!shareableLink) {
      const linkId = nanoid(12);
      shareableLink = `${env.APP_BASE_URL}/s/${linkId}`;
    }

    const [updatedSurvey] = await getDb()
      .update(surveys)
      .set({
        status: "active",
        shareableLink,
        confirmed: true,
        updatedAt: new Date(),
      })
      .where(eq(surveys.id, surveyId))
      .returning();

    return new Response(
      JSON.stringify({
        id: updatedSurvey.id,
        title: updatedSurvey.title,
        status: updatedSurvey.status,
        shareableLink: updatedSurvey.shareableLink,
        participantLimit: updatedSurvey.participantLimit,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const authError = mapSessionAuthError(error); if (authError) return authError; return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]/finalize:post");
  }
}

