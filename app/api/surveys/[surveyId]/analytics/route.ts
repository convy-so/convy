import { apiUnhandledError } from "@/lib/api/error-contract";

import { getVerifiedSession } from "@/lib/auth/dal";
import { getSurveyAnalyticsViewModel } from "@/lib/surveys/use-cases/get-survey-analytics";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { searchParams } = new URL(request.url);

    return getSurveyAnalyticsViewModel({
      surveyId,
      session,
      language: searchParams.get("language"),
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to fetch analytics", "/api/surveys/[surveyId]/analytics:get");
  }
}
