import { and, eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import {
  sampleConversations,
  surveyCreationConversations,
  surveys,
} from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import {
  toPersistedUIChatMessages,
  toVisibleConversationMessages,
} from "@/shared/chat/chat-ui-messages";

export async function getSurveyCreationInitialData(surveyId: string) {
  const session = await getVerifiedSession();
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

export async function getSampleConversationInitialData(
  surveyId: string,
  conversationNumber: number,
) {
  const session = await getVerifiedSession();

  const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
  if (!survey) {
    throw new Error("Survey not found");
  }

  const permission = await getSurveyPermissionForSession(session, survey.id);
  if (!hasSurveyPermission(permission, "canView")) {
    throw new Error("Unauthorized");
  }

  const [sample] = await getDb()
    .select()
    .from(sampleConversations)
    .where(
      and(
        eq(sampleConversations.surveyId, surveyId),
        eq(sampleConversations.conversationNumber, conversationNumber),
      ),
    )
    .limit(1);

  return {
    messages: toVisibleConversationMessages(
      toPersistedUIChatMessages(sample?.messages ?? [], ["user", "assistant"]),
    ),
  };
}
