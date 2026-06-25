import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { surveyConversations } from "@/shared/db/schema";
import {
  toPersistedUIChatMessages,
  toVisibleConversationMessages,
} from "@/shared/chat/chat-ui-messages";
import { SURVEY_COMPLETION_TAG } from "@/shared/chat/chat-ui-signals";
import type { ChatMessage } from "@/shared/chat/chat-types";
import { scheduleAnalyticsRefresh } from "@/features/surveys/server/analytics/analytics-refresh-scheduler";
import { persistConductingTurnTranscript } from "@/features/surveys/server/education/conducting-runtime";
import { updateSessionState } from "@/features/surveys/server/education/storage";
import type { SessionState } from "@/features/surveys/server/education/types";

export function createTextStreamResponse(params: {
  messageId: string;
  text: string;
}) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({
          id: params.messageId,
          type: "text-start",
        });
        writer.write({
          id: params.messageId,
          type: "text-delta",
          delta: params.text,
        });
        writer.write({
          id: params.messageId,
          type: "text-end",
        });
      },
    }),
  });
}

export async function persistRespondentRedirect(params: {
  conversationId: string;
  visibleMessages: ChatMessage[];
  redirectMessage: ChatMessage;
}) {
  await getDb()
    .update(surveyConversations)
    .set({
      rawConversation: [...params.visibleMessages, params.redirectMessage],
      updatedAt: new Date(),
    })
    .where(eq(surveyConversations.id, params.conversationId));
}

export async function finalizePlannedRespondentTurn(params: {
  conversationId: string;
  surveyId: string;
  userId: string;
  sessionId: string;
  assistantMessage: string;
  rationale: string;
  currentSessionState: SessionState;
  visibleMessages: ChatMessage[];
}) {
  const completionText = `${SURVEY_COMPLETION_TAG} ${params.assistantMessage.trim() || "Thank you. That gives me enough to close this interview."}`.trim();
  const completionMessage: ChatMessage = {
    id: nanoid(),
    role: "assistant",
    content: completionText,
    parts: [
      { type: "text", text: completionText },
      {
        type: "tool-result",
        toolCallId: `finish-survey-${nanoid(8)}`,
        toolName: "finishSurvey",
        result: { success: true, message: "Survey marked as complete" },
      },
    ],
    timestamp: new Date().toISOString(),
  };
  const nextSessionState: SessionState = {
    ...params.currentSessionState,
    status: "completed",
    stopReason: "planned_finish_signal",
    activeWorkflowDecision: {
      activeNodeId: null,
      rationale: params.rationale,
      shouldStop: true,
    },
  };

  await updateSessionState(params.sessionId, nextSessionState);
  await getDb()
    .update(surveyConversations)
    .set({
      rawConversation: [...params.visibleMessages, completionMessage],
      completed: true,
      updatedAt: new Date(),
    })
    .where(eq(surveyConversations.id, params.conversationId));
  await scheduleAnalyticsRefresh({
    surveyId: params.surveyId,
    userId: params.userId,
  }).catch(() => {});

  return {
    nextSessionState,
    response: createTextStreamResponse({
      messageId: completionMessage.id,
      text: completionText,
    }),
  };
}

export async function persistRespondentStreamResult(params: {
  conversationId: string;
  surveyId: string;
  userId: string;
  sessionId: string;
  messages: UIMessage[];
  completed: boolean;
}) {
  const persistedMessages = toVisibleConversationMessages(
    toPersistedUIChatMessages(params.messages, ["user", "assistant"]),
  );

  await getDb()
    .update(surveyConversations)
    .set({
      rawConversation: persistedMessages,
      completed: params.completed,
      updatedAt: new Date(),
    })
    .where(eq(surveyConversations.id, params.conversationId));

  if (!persistedMessages.some((message) => message.role === "user")) {
    return;
  }

  await persistConductingTurnTranscript({
    surveyId: params.surveyId,
    sessionId: params.sessionId,
    messages: persistedMessages,
  });
  await scheduleAnalyticsRefresh({
    surveyId: params.surveyId,
    userId: params.userId,
  }).catch(() => {});
}
