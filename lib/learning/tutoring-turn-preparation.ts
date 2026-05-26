import { extractMessageText, toPersistedUIChatMessages, toUIMessages } from "@/lib/chat-ui-messages";
import { listLearningMessages } from "@/lib/learning/storage";
import { tutorRuntimeService } from "@/lib/learning/tutor-runtime-service";
import { sanitizeUserInput } from "@/lib/ai/sanitization";

import type { UIMessage } from "ai";
import type { PrepareTutoringTurnParams } from "@/lib/learning/tutoring-turn-types";

export function getLatestUserText(messages: UIMessage[]) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  return extractMessageText(latestUserMessage ? toPersistedUIChatMessages([latestUserMessage])[0] : null).trim();
}

export async function prepareTutoringTurn(params: PrepareTutoringTurnParams) {
  const previousAssistant = [...(await listLearningMessages(params.tutorSessionId))]
    .reverse()
    .find((message) => message.role === "assistant");

  const prepared = await tutorRuntimeService.prepareTurn({
    topicId: params.topicId,
    topicTitle: params.access.topic.title,
    subjectKey: params.access.topic.subjectKey,
    subjectLabel: params.access.topic.subject,
    sourceBoundary: params.access.topic.sourceBoundary,
    studentUserId: params.access.classroomStudent.userId,
    studyLanguage: params.studyLanguage,
    state: params.state,
    interestProfile: params.access.classroomStudent.interestProfile?.profile ?? null,
  });

  const { createTutorTools } = await import("@/lib/learning/agent-tools");
  const tools = createTutorTools({
    topicTitle: params.access.topic.title,
    studentContext: "Student learning " + params.access.topic.title,
  });

  const sanitizedMessages = toUIMessages(
    toPersistedUIChatMessages(params.messages).map((m) =>
      m.role === "user"
        ? { ...m, content: sanitizeUserInput(m.content, { maxLength: 2000, allowNewlines: true }) }
        : m,
    ),
  );

  const fewShotExamples = prepared.activeFramework.framework.fewShotExamples.map(
    (example, index) => ({
      label: `framework_example_${index + 1}`,
      content: example,
    }),
  );

  return { previousAssistant, prepared, fewShotExamples, tools, sanitizedMessages };
}
