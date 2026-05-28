import { extractMessageText, toPersistedUIChatMessages, toUIMessages } from "@/lib/chat-ui-messages";
import { getLatestAssistantLearningMessage } from "@/lib/learning/storage";
import { tutorRuntimeService } from "@/lib/learning/tutor-runtime-service";
import { sanitizeUserInput } from "@/lib/ai/sanitization";
import {
  logTutoringDebug,
  summarizeTutoringMessages,
  summarizeTutoringText,
  createTutoringTimer,
  measureTutoringStep,
} from "@/lib/learning/tutoring-debug";

import type { UIMessage } from "ai";
import type { PrepareTutoringTurnParams } from "@/lib/learning/tutoring-turn-types";

export function getLatestUserText(messages: UIMessage[]) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  return extractMessageText(latestUserMessage ? toPersistedUIChatMessages([latestUserMessage])[0] : null).trim();
}

export async function prepareTutoringTurn(params: PrepareTutoringTurnParams) {
  const timer = createTutoringTimer();
  logTutoringDebug("turn:prepare:start", {
    topicId: params.topicId,
    tutorSessionId: params.tutorSessionId,
    studyLanguage: params.studyLanguage,
    messageCount: params.messages.length,
    latestUserText: summarizeTutoringText(params.latestUserText, 180),
  });
  const previousAssistant = await measureTutoringStep(
    "turn:prepare:previous-assistant",
    {
      topicId: params.topicId,
      tutorSessionId: params.tutorSessionId,
    },
    async () => await getLatestAssistantLearningMessage(params.tutorSessionId),
  );
  logTutoringDebug("turn:prepare:previous-assistant", {
    topicId: params.topicId,
    tutorSessionId: params.tutorSessionId,
    previousAssistant: previousAssistant
      ? summarizeTutoringText(previousAssistant.content, 180)
      : null,
    durationMs: timer.elapsedMs(),
  });

  const { createTutorTools } = await import("@/lib/learning/agent-tools");
  const tools = await measureTutoringStep(
    "turn:prepare:tools",
    {
      topicId: params.topicId,
      tutorSessionId: params.tutorSessionId,
    },
    async () =>
      createTutorTools({
        topicTitle: params.access.topic.title,
        studentContext: "Student learning " + params.access.topic.title,
      }),
  );
  logTutoringDebug("turn:prepare:tools", {
    topicId: params.topicId,
    tutorSessionId: params.tutorSessionId,
    toolNames: Object.keys(tools),
    durationMs: timer.elapsedMs(),
  });

  const sanitizedMessages = await measureTutoringStep(
    "turn:prepare:sanitize",
    {
      topicId: params.topicId,
      tutorSessionId: params.tutorSessionId,
      messageCount: params.messages.length,
    },
    async () =>
      toUIMessages(
        toPersistedUIChatMessages(params.messages).map((m) =>
          m.role === "user"
            ? { ...m, content: sanitizeUserInput(m.content, { maxLength: 2000, allowNewlines: true }) }
            : m,
        ),
      ),
  );
  const recentMessages = toPersistedUIChatMessages(sanitizedMessages).flatMap((message) =>
    message.role === "user" || message.role === "assistant"
      ? [{ role: message.role, content: message.content }]
      : [],
  );

  const prepared = await measureTutoringStep(
    "turn:prepare:runtime",
    {
      topicId: params.topicId,
      tutorSessionId: params.tutorSessionId,
      studyLanguage: params.studyLanguage,
    },
    async () =>
      await tutorRuntimeService.prepareTurn({
        topicId: params.topicId,
        topicTitle: params.access.topic.title,
        subjectKey: params.access.topic.subjectKey,
        subjectLabel: params.access.topic.subject,
        sourceBoundary: params.access.topic.sourceBoundary,
        studentUserId: params.access.classroomStudent.userId,
        studyLanguage: params.studyLanguage,
        state: params.state,
        interestProfile: params.access.classroomStudent.interestProfile?.profile ?? null,
        recentMessages,
        latestUserText: params.latestUserText,
      }),
  );
  logTutoringDebug("turn:prepare:sanitized-messages", {
    topicId: params.topicId,
    tutorSessionId: params.tutorSessionId,
    messages: summarizeTutoringMessages(sanitizedMessages.slice(-4)),
    durationMs: timer.elapsedMs(),
  });
  logTutoringDebug("turn:prepare:runtime", {
    topicId: params.topicId,
    tutorSessionId: params.tutorSessionId,
    groundingUnitCount: prepared.groundingUnits.length,
    contextBundleVersionId: prepared.contextBundle.versionId,
    durationMs: timer.elapsedMs(),
  });

  return { previousAssistant, prepared, tools, sanitizedMessages };
}
