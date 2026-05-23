import { persistTutorTurnOutcome } from "@/lib/learning/storage";
import { studentModelService } from "@/lib/learning/student-model-service";
import { logBraintrustTrace } from "@/lib/ai/braintrust";
import {
  finalizeTutoringSession,
  shouldAutoCompleteTutoringSession,
  shouldRefreshStudentModel,
} from "@/lib/learning/tutoring-session-lifecycle";

import type { FinalizeTutoringTurnParams } from "@/lib/learning/tutoring-turn-types";

function getRetrievedContext(steps: FinalizeTutoringTurnParams["result"]["steps"]) {
  return steps
    .flatMap((step) => step.toolResults)
    .flatMap((result) =>
      result.toolName === "search_course_materials"
        ? ((result.output as { results?: Array<{ content: string }> }).results?.map((res) => res.content) ?? [])
        : [],
    );
}

export async function finalizeTutoringTurn(params: FinalizeTutoringTurnParams) {
  const lastStep = params.result.steps.at(-1);
  const assistantText = lastStep?.text?.trim();
  if (!assistantText) return;

  const autoComplete = shouldAutoCompleteTutoringSession({
    runtimeModel: params.prepared.runtimeModel,
    previousState: params.state,
    nextState: params.prepared.nextState,
  });
  const shouldUpdateStudentModel = shouldRefreshStudentModel({
    previousState: params.state,
    nextState: params.prepared.nextState,
    forcedCompletion: autoComplete,
  });

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
          ...params.prepared.contentScope,
          retrievedContext: getRetrievedContext(params.result.steps),
        },
        conversationExcerpt: [
          ...(params.previousAssistantText ? [{ role: "assistant" as const, content: params.previousAssistantText }] : []),
          { role: "user" as const, content: params.latestUserText },
          { role: "assistant" as const, content: assistantText },
        ],
        runtimeModel: params.prepared.runtimeModel,
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

      runtimeModelId: params.prepared.runtimeModel.id,
      runtimeModelVersion: params.prepared.runtimeModel.version,
      toolCalls: params.result.steps.flatMap((step) => step.toolCalls),
    },
    interactionMetadata: {},
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
      materialIds: params.prepared.contentScope.materialIds,

      conflictState: params.prepared.runtimeModel.conflictIds.length > 0 ? "open" : "clear",
      autoCompleted: autoComplete,
      studentModelRefreshed: shouldUpdateStudentModel,
      toolUse: params.result.steps.some((step) => step.toolCalls.length > 0),
    },
  }).catch(() => undefined);
}
