import { getVerifiedSession } from "@/features/auth/public-server";
import {
  getSurveyDetailsViewModel,
} from "@/features/surveys/server/use-cases/get-survey-details";
import type {
  SurveyDetailsResponse,
  SurveyListItem,
} from "@/features/surveys/client/api/surveys-api";
import { listSurveysForUser } from "@/features/surveys/server/surveys-route-service";

export async function getSurveyListData(): Promise<SurveyListItem[]> {
  const session = await getVerifiedSession();
  return (await listSurveysForUser(session.user.id)) as SurveyListItem[];
}

export async function getSurveyDetailsData(
  surveyId: string,
): Promise<SurveyDetailsResponse> {
  const session = await getVerifiedSession();
  return getSurveyDetailsViewModel(surveyId, session);
}
