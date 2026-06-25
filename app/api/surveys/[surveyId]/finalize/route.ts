import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { mapSessionAuthError } from "@/shared/http/route-auth-error";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { surveys } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { env } from "@/shared/config/server-env";
import { getDb } from "@/shared/db";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import { SURVEY_STATUS } from "@/shared/surveys/constants";
import { requireValue } from "@/shared/utils/collections";

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

    if (survey.status !== SURVEY_STATUS.CREATING) {
      return apiError("VALIDATION_ERROR", "Survey is not in creation mode");
    }

    // Generate shareable link if not exists
    let shareableLink = survey.shareableLink;
    if (!shareableLink) {
      const linkId = nanoid(12);
      shareableLink = `${env.APP_BASE_URL}/s/${linkId}`;
    }

    const [updatedSurvey] = await getDb()
      .update(surveys)
      .set({
        status: SURVEY_STATUS.ACTIVE,
        shareableLink,
        confirmed: true,
        updatedAt: new Date(),
      })
      .where(eq(surveys.id, surveyId))
      .returning();
    const finalizedSurvey = requireValue(
      updatedSurvey,
      `Failed to finalize survey ${surveyId}`,
    );

    return new Response(
      JSON.stringify({
        id: finalizedSurvey.id,
        title: finalizedSurvey.title,
        status: finalizedSurvey.status,
        shareableLink: finalizedSurvey.shareableLink,
        participantLimit: finalizedSurvey.participantLimit,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const authError = mapSessionAuthError(error);
    if (authError) return authError;

    return apiUnhandledError(
      error,
      "Internal server error",
      "/api/surveys/[surveyId]/finalize:post",
    );
  }
}

