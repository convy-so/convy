import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { surveyCreationConversations, surveys } from "@/shared/db/schema";
import type { AuthSessionWithUser } from "@/features/auth/public-server";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";

type SurveySession = Pick<AuthSessionWithUser, "user">;

export async function getSurveyCreationStateViewModel(
  surveyId: string,
  session: SurveySession,
) {
  const permission = await getSurveyPermissionForSession(session, surveyId);

  if (!hasSurveyPermission(permission, "canView")) {
    throw new Error("Unauthorized");
  }

  const [survey, creationConversation] = await Promise.all([
    getDb()
      .select({
        id: surveys.id,
        status: surveys.status,
        language: surveys.language,
        isVoice: surveys.isVoice,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .then((rows) => rows[0]),
    getDb()
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId))
      .then((rows) => rows[0]),
  ]);

  if (!survey) {
    throw new Error("Survey not found");
  }

  return {
    surveyId,
    status: survey.status,
    language: survey.language,
    isVoice: survey.isVoice,
    permission,
    messages: creationConversation?.messages || [],
    collectedInfo: creationConversation?.collectedInfo || {},
    extractedData: creationConversation?.extractedData || {},
  };
}
