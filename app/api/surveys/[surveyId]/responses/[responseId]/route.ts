import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/features/auth/public-server";
import { getSurveyResponseDetailViewModel } from "@/features/surveys/server/use-cases/get-survey-response-detail";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { mapSessionAuthError } from "@/shared/http/route-auth-error";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string; responseId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId, responseId } = await params;
    return NextResponse.json(
      await getSurveyResponseDetailViewModel(surveyId, responseId, session),
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Survey not found" || error.message === "Response not found") {
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
      "Failed to fetch response details",
      "survey-responses:details",
    );
  }
}
