import { appendLearningMessage, logLearningInteraction } from "@/lib/learning/storage";

export async function logUserTurn(params: {
  sessionId: string;
  classroomStudentId: string;
  topicId: string;
  content: string;
  metadata: Record<string, unknown>;
}) {
  await appendLearningMessage({ sessionId: params.sessionId, role: "user", content: params.content, metadata: params.metadata });
  await logLearningInteraction({
    classroomStudentId: params.classroomStudentId,
    topicId: params.topicId,
    sessionId: params.sessionId,
    role: "user",
    interactionType: "student_message",
    content: params.content,
    metadata: params.metadata,
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
      await appendLearningMessage({
        sessionId: params.sessionId,
        role: "assistant",
        content: params.redirectMessage,
        metadata: { messageKind: "scope_redirect", classification: params.classification },
      });
      await logLearningInteraction({
        classroomStudentId: params.classroomStudentId,
        topicId: params.topicId,
        sessionId: params.sessionId,
        role: "assistant",
        interactionType: "tutor_message",
        content: params.redirectMessage,
        metadata: { messageKind: "scope_redirect", classification: params.classification },
      });
    },
  };
}
