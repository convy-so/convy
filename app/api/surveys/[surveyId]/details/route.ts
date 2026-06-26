import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { mapSessionAuthError } from "@/shared/http/route-auth-error";

import { getVerifiedSession } from "@/features/auth/public-server";
import { getSurveyDetailsViewModel } from "@/features/surveys/server/use-cases/get-survey-details";

/**
 * GET - Get detailed survey info for the owner
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    return NextResponse.json(await getSurveyDetailsViewModel(surveyId, session));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Survey not found") {
        return apiError("NOT_FOUND", error.message);
      }
      if (error.message === "Unauthorized") {
        return apiError("UNAUTHORIZED", error.message);
      }
    }
    const authError = mapSessionAuthError(error);
    if (authError) return authError;

    return apiUnhandledError(
      error,
      "Internal server error",
      "/api/surveys/[surveyId]/details:get",
    );
  }
}


