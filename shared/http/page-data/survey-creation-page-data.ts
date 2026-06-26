import { getVerifiedSession } from "@/features/auth/public-server";
import { getSampleConversationStateViewModel } from "@/features/surveys/server/use-cases/get-sample-conversation-state";
import { getSurveyCreationStateViewModel } from "@/features/surveys/server/use-cases/get-survey-creation-state";

export async function getSurveyCreationInitialData(surveyId: string) {
  const session = await getVerifiedSession();
  return getSurveyCreationStateViewModel(surveyId, session);
}

export async function getSampleConversationInitialData(
  surveyId: string,
  conversationNumber: number,
) {
  const session = await getVerifiedSession();
  const sampleState = await getSampleConversationStateViewModel(
    surveyId,
    conversationNumber,
    session,
  );
  return {
    messages: sampleState.messages,
  };
}
