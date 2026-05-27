import { appendLearningMessage, logLearningInteraction } from "@/lib/learning/storage";
import { logTutoringDebug } from "@/lib/learning/tutoring-debug";

type BaseTurnLogParams = {
  sessionId: string;
  classroomStudentId: string;
  topicId: string;
  content: string;
  metadata: Record<string, unknown>;
};

export async function logUserTurn(params: BaseTurnLogParams) {
  logTutoringDebug("turn-log:user:start", {
    sessionId: params.sessionId,
    topicId: params.topicId,
    contentLength: params.content.length,
    metadataKeys: Object.keys(params.metadata),
  });
  await appendLearningMessage({
    sessionId: params.sessionId,
    role: "user",
    content: params.content,
    metadata: params.metadata,
  });
  await logLearningInteraction({
    classroomStudentId: params.classroomStudentId,
    topicId: params.topicId,
    sessionId: params.sessionId,
    role: "user",
    interactionType: "student_message",
    content: params.content,
    metadata: params.metadata,
  });
  logTutoringDebug("turn-log:user:done", {
    sessionId: params.sessionId,
    topicId: params.topicId,
  });
}

export async function logAssistantTurn(params: BaseTurnLogParams) {
  logTutoringDebug("turn-log:assistant:start", {
    sessionId: params.sessionId,
    topicId: params.topicId,
    contentLength: params.content.length,
    metadataKeys: Object.keys(params.metadata),
  });
  await appendLearningMessage({
    sessionId: params.sessionId,
    role: "assistant",
    content: params.content,
    metadata: params.metadata,
  });
  await logLearningInteraction({
    classroomStudentId: params.classroomStudentId,
    topicId: params.topicId,
    sessionId: params.sessionId,
    role: "assistant",
    interactionType: "tutor_message",
    content: params.content,
    metadata: params.metadata,
  });
  logTutoringDebug("turn-log:assistant:done", {
    sessionId: params.sessionId,
    topicId: params.topicId,
  });
}

export function buildScopeRedirectResponse(params: {
  sessionId: string;
  classroomStudentId: string;
  topicId: string;
  classification: string;
  redirectMessage: string;
}) {
  return {
    streamId: `redirect-${crypto.randomUUID()}`,
    text: params.redirectMessage,
    async persist() {
      logTutoringDebug("turn-log:redirect:persist", {
        sessionId: params.sessionId,
        topicId: params.topicId,
        classification: params.classification,
      });
      await logAssistantTurn({
        sessionId: params.sessionId,
        classroomStudentId: params.classroomStudentId,
        topicId: params.topicId,
        content: params.redirectMessage,
        metadata: {
          messageKind: "scope_redirect",
          classification: params.classification,
        },
      });
    },
  };
}
