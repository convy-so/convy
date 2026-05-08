import type { UIMessage } from "ai";
import { z } from "zod";

import { extractMessageText, toPersistedUIChatMessages, toUIMessages } from "@/lib/chat-ui-messages";
import {
  appendLearningMessage,
  listLearningMessages,
  logLearningInteraction,
  persistTutorTurnOutcome,
} from "@/lib/learning/storage";
import { tutorRuntimeService } from "@/lib/learning/tutor-runtime-service";
import {
  finalizeTutoringSession,
  shouldAutoCompleteTutoringSession,
  shouldRefreshStudentModel,
} from "@/lib/learning/tutoring-session-lifecycle";
import { learningSessionStateSchema } from "@/lib/learning/types";
import { sanitizeUserInput } from "@/lib/ai/sanitization";
import { studentModelService } from "@/lib/learning/student-model-service";
import { logBraintrustTrace } from "@/lib/ai/braintrust";
import { getDynamicFewShotExamples } from "@/lib/ai/few-shot-library";
import type { StudentTopicAccess } from "@/lib/learning/tutoring-route-orchestrator";

export function getLatestUserText(messages: UIMessage[]) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  return extractMessageText(
    latestUserMessage ? toPersistedUIChatMessages([latestUserMessage])[0] : null,
  ).trim();
}

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
    text: params.redirectMessage,
  };
}

export async function prepareTutoringTurn(params: {
  topicId: string;
  access: StudentTopicAccess;
  tutorSessionId: string;
  studyLanguage: string;
  state: z.infer<typeof learningSessionStateSchema>;
  latestUserText: string;
  messages: UIMessage[];
}) {
  const previousAssistant = [...(await listLearningMessages(params.tutorSessionId))]
    .reverse()
    .find((message) => message.role === "assistant");

  const [prepared, fewShotExamples] = await Promise.all([
    tutorRuntimeService.prepareAgentTurn({
      topicId: params.topicId,
      topicTitle: params.access.topic.title,
      sourceBoundary: params.access.topic.sourceBoundary,
      classroomId: params.access.topic.classroomId,
      classroomStudentId: params.access.classroomStudent.id,
      studentUserId: params.access.classroomStudent.userId,
      sessionId: params.tutorSessionId,
      studyLanguage: params.studyLanguage,
      state: params.state,
      latestStudentMessage: params.latestUserText,
      latestTutorMessage: previousAssistant?.content ?? null,
    }),
    getDynamicFewShotExamples({
      feature: "tutoring",
      limit: 3,
      context: [params.latestUserText, params.access.topic.title, params.access.topic.subject]
        .filter(Boolean)
        .join(" | "),
    }),
  ]);

  const { createTutorTools } = await import("@/lib/learning/agent-tools");
  const tools = createTutorTools({ topicId: params.topicId, contentLocale: params.access.topic.contentLocale });

  const sanitizedMessages = toUIMessages(
    toPersistedUIChatMessages(params.messages).map((m) =>
      m.role === "user"
        ? { ...m, content: sanitizeUserInput(m.content, { maxLength: 2000, allowNewlines: true }) }
        : m,
    ),
  );

  return { previousAssistant, prepared, fewShotExamples, tools, sanitizedMessages };
}

export async function finalizeTutoringTurn(params: {
  topicId: string;
  tutorSessionId: string;
  state: z.infer<typeof learningSessionStateSchema>;
  expectedStateVersion: number;
  latestUserText: string;
  access: StudentTopicAccess;
  sessionUserId: string;
  prepared: Awaited<ReturnType<typeof tutorRuntimeService.prepareAgentTurn>>;
  previousAssistantText: string | null;
  result: { steps: Array<{ text?: string; toolCalls: unknown[]; toolResults: Array<{ toolName: string; output: unknown }> }> };
}) {
  const lastStep = params.result.steps.at(-1);
  const assistantText = lastStep?.text?.trim();
  if (!assistantText) return;

  const autoComplete = shouldAutoCompleteTutoringSession({ runtimeModel: params.prepared.runtimeModel, previousState: params.state, nextState: params.prepared.nextState });
  const shouldUpdateStudentModel = shouldRefreshStudentModel({ previousState: params.state, nextState: params.prepared.nextState, forcedCompletion: autoComplete });

  const snapshot = shouldUpdateStudentModel
    ? await studentModelService.updateFromConversation({
        studentModelId: params.prepared.studentModel.id,
        topicId: params.topicId,
        sessionId: params.tutorSessionId,
        sourceType: "session_turn",
        sourceId: params.tutorSessionId,
        userId: params.sessionUserId,
        existingSnapshot: params.prepared.latestStudentSnapshot,
        contentScope: {
          ...params.prepared.baselineScope,
          retrievedContext: params.result.steps
            .flatMap((s) => s.toolResults)
            .flatMap((r) => (r.toolName === "search_course_materials" ? ((r.output as { results?: Array<{ content: string }> }).results?.map((res) => res.content) ?? []) : [])),
        },
        conversationExcerpt: [
          ...(params.previousAssistantText ? [{ role: "assistant" as const, content: params.previousAssistantText }] : []),
          { role: "user" as const, content: params.latestUserText },
          { role: "assistant" as const, content: assistantText },
        ],
      })
    : null;

  const refreshedAt = new Date().toISOString();
  const nextState = {
    ...params.prepared.nextState,
    studentModelSnapshotId: shouldUpdateStudentModel
      ? snapshot?.id ?? null
      : params.prepared.latestStudentSnapshotRecord?.id ?? null,
    recentEvidence: [...params.prepared.nextState.recentEvidence, params.latestUserText, assistantText].slice(-8),
    turnCount: params.state.turnCount + 1,
    turnsSinceStudentModelRefresh: shouldUpdateStudentModel ? 0 : params.state.turnsSinceStudentModelRefresh + 1,
    lastStudentModelRefreshAt: shouldUpdateStudentModel ? refreshedAt : params.state.lastStudentModelRefreshAt,
  };

  const persistedSession = await persistTutorTurnOutcome({
    sessionId: params.tutorSessionId,
    classroomStudentId: params.access.classroomStudent.id,
    topicId: params.topicId,
    assistantText,
    assistantMetadata: {
      frameworkStageId: params.prepared.frameworkState.currentStageId,
      runtimeModelId: params.prepared.runtimeModel.id,
      runtimeModelVersion: params.prepared.runtimeModel.version,
      toolCalls: params.result.steps.flatMap((s) => s.toolCalls),
    },
    interactionMetadata: { frameworkStageId: params.prepared.frameworkState.currentStageId },
    nextState,
    expectedStateVersion: params.expectedStateVersion,
  });

  if (autoComplete) {
    await finalizeTutoringSession({
      sessionId: params.tutorSessionId,
      topicId: params.topicId,
      classroomId: params.access.topic.classroomId ?? "",
      classroomStudentId: params.access.classroomStudent.id,
      studentUserId: params.sessionUserId,
      studentName: params.access.classroomStudent.fullName,
      topicTitle: params.access.topic.title,
      sourceLocale: params.access.topic.contentLocale,
      summary: assistantText,
      expectedStateVersion: persistedSession.stateVersion ?? 1,
      state: nextState,
      reason: "framework_complete",
    });
  }

  await logBraintrustTrace({
    event: "tutoring_turn",
    input: { topicId: params.topicId, sessionId: params.tutorSessionId, studentMessage: params.latestUserText },
    output: { tutorMessage: assistantText, steps: params.result.steps.length },
    metadata: {
      topicId: params.topicId,
      runtimeModelVersion: params.prepared.runtimeModel.version,
      frameworkVersion: params.prepared.runtimeModel.frameworkVersionId,
      studentModelSnapshotId: shouldUpdateStudentModel ? snapshot?.id : params.prepared.latestStudentSnapshotRecord?.id,
      materialIds: params.prepared.baselineScope.materialIds,
      stageId: params.prepared.frameworkState.currentStageId,
      conflictState: params.prepared.runtimeModel.conflictIds.length > 0 ? "open" : "clear",
      autoCompleted: autoComplete,
      studentModelRefreshed: shouldUpdateStudentModel,
      toolUse: params.result.steps.some((s) => s.toolCalls.length > 0),
    },
  }).catch(() => undefined);
}
