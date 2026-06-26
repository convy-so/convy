import { extractMessageText, toPersistedUIChatMessages, toUIMessages } from "@/shared/chat/chat-ui-messages";
import { getLatestAssistantStudentMessage } from "@/features/tutoring/public-server";
import { tutorRuntimeService } from "@/features/tutoring/server/tutor-runtime-service";
import { sanitizeUserInput } from "@/shared/ai/sanitization";
import {
  logTutoringDebug,
  summarizeTutoringMessages,
  summarizeTutoringText,
  createTutoringTimer,
  measureTutoringStep,
} from "@/features/tutoring/public-server";

import type { UIMessage } from "ai";
import type { PrepareTutoringTurnParams } from "@/features/tutoring/server/tutoring-turn-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getLatestUserText(messages: UIMessage[]) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  return extractMessageText(latestUserMessage ? toPersistedUIChatMessages([latestUserMessage])[0] : null).trim();
}

function collectPriorQuizIds(messages: UIMessage[]) {
  const ids = new Set<string>();

  for (const message of toPersistedUIChatMessages(messages)) {
    for (const part of message.parts ?? []) {
      if (part.type !== "tool-result" || part.toolName !== "administer_quiz") {
        continue;
      }

      const result = isRecord(part.result) ? part.result : {};
      if (typeof result.quizId === "string" && result.quizId.trim()) {
        ids.add(result.quizId);
      }
    }
  }

  return Array.from(ids);
}

export async function prepareTutoringTurn(params: PrepareTutoringTurnParams) {
  const timer = createTutoringTimer();
  logTutoringDebug("turn:prepare:start", {
    lessonId: params.lessonId,
    tutorSessionId: params.tutorSessionId,
    studyLanguage: params.studyLanguage,
    messageCount: params.messages.length,
    latestUserText: summarizeTutoringText(params.latestUserText, 180),
  });
  const previousAssistant = await measureTutoringStep(
    "turn:prepare:previous-assistant",
    {
      lessonId: params.lessonId,
      tutorSessionId: params.tutorSessionId,
    },
    () => getLatestAssistantStudentMessage(params.tutorSessionId),
  );
  logTutoringDebug("turn:prepare:previous-assistant", {
    lessonId: params.lessonId,
    tutorSessionId: params.tutorSessionId,
    previousAssistant: previousAssistant
      ? summarizeTutoringText(previousAssistant.content, 180)
      : null,
    durationMs: timer.elapsedMs(),
  });

  const sanitizedMessages = await measureTutoringStep(
    "turn:prepare:sanitize",
    {
      lessonId: params.lessonId,
      tutorSessionId: params.tutorSessionId,
      messageCount: params.messages.length,
    },
    () =>
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
      lessonId: params.lessonId,
      tutorSessionId: params.tutorSessionId,
      studyLanguage: params.studyLanguage,
    },
    () =>
      tutorRuntimeService.prepareTurn({
        lessonId: params.lessonId,
        lessonTitle: params.access.lesson.title,
        subjectKey: params.access.lesson.courseId,
        subjectLabel: params.access.lesson.course.title,
        sourceBoundary: params.access.lesson.sourceBoundary,
        studentUserId: params.access.classroomStudent.userId,
        studyLanguage: params.studyLanguage,
        state: params.state,
        interestProfile: params.access.classroomStudent.interestProfile?.profile ?? null,
        recentMessages,
        latestUserText: params.latestUserText,
      }),
  );
  logTutoringDebug("turn:prepare:sanitized-messages", {
    lessonId: params.lessonId,
    tutorSessionId: params.tutorSessionId,
    messages: summarizeTutoringMessages(sanitizedMessages.slice(-4)),
    durationMs: timer.elapsedMs(),
  });
  logTutoringDebug("turn:prepare:runtime", {
    lessonId: params.lessonId,
    tutorSessionId: params.tutorSessionId,
    groundingUnitCount: prepared.groundingUnits.length,
    contextBundleVersionId: prepared.contextBundle.versionId,
    durationMs: timer.elapsedMs(),
  });

  const { createTutorTools } = await import("@/features/tutoring/server/agent-tools");
  const priorQuizIds = collectPriorQuizIds(sanitizedMessages);
  const tools = await measureTutoringStep(
    "turn:prepare:tools",
    {
      lessonId: params.lessonId,
      tutorSessionId: params.tutorSessionId,
      priorQuizCount: priorQuizIds.length,
    },
    () =>
      createTutorTools({
        lessonTitle: params.access.lesson.title,
        studentContext: "Student learning " + params.access.lesson.title,
        priorQuizIds,
        capabilityGuidance: prepared.activeFramework.framework.capabilityGuidance,
      }),
  );
  logTutoringDebug("turn:prepare:tools", {
    lessonId: params.lessonId,
    tutorSessionId: params.tutorSessionId,
    toolNames: Object.keys(tools),
    priorQuizIds,
    hasFinishSessionTool: Object.prototype.hasOwnProperty.call(
      tools,
      "finish_session",
    ),
    durationMs: timer.elapsedMs(),
  });

  return { previousAssistant, prepared, tools, sanitizedMessages };
}

