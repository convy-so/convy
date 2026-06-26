import { and, eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { sampleConversations, surveys } from "@/shared/db/schema";
import type { AuthSessionWithUser } from "@/features/auth/public-server";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import { getSessionBySourceId } from "@/features/surveys/server/education/storage";
import {
  toPersistedUIChatMessages,
  toVisibleConversationMessages,
} from "@/shared/chat/chat-ui-messages";

type SurveySession = Pick<AuthSessionWithUser, "user">;

export async function getSampleConversationStateViewModel(
  surveyId: string,
  conversationNumber: number,
  session: SurveySession,
) {
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

  const sessionRow = sample ? await getSessionBySourceId(sample.id) : null;

  return {
    messages: toVisibleConversationMessages(
      toPersistedUIChatMessages(sample?.messages ?? [], ["user", "assistant"]),
    ),
    completed: sessionRow?.sessionState?.status === "completed",
  };
}
