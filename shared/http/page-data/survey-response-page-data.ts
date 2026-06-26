import { getVerifiedSession } from "@/features/auth/public-server";
import type { AnalyticsSessionDetail } from "@/features/surveys/server/analytics/dashboard-analytics";
import { getSurveyResponseDetailViewModel } from "@/features/surveys/server/use-cases/get-survey-response-detail";

export async function getSurveyResponseDetailData(
  surveyId: string,
  responseId: string,
): Promise<AnalyticsSessionDetail> {
  const session = await getVerifiedSession();
  return getSurveyResponseDetailViewModel(surveyId, responseId, session);
}
