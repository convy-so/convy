import { logBraintrustTrace } from "@/lib/ai/braintrust";
import { persistTutorTurnOutcome } from "@/lib/learning/storage";
import {
  formatTutorResponseWarnings,
  normalizeTutorResponseText,
} from "@/lib/learning/tutor-response-format";
import {
  logTutoringDebug,
  logTutoringWarn,
  summarizeTutoringText,
  createTutoringTimer,
  measureTutoringStep,
} from "@/lib/learning/tutoring-debug";

import type { FinalizeTutoringTurnParams } from "@/lib/learning/tutoring-turn-types";

function getLatestAssessmentResult(
  steps: FinalizeTutoringTurnParams["result"]["steps"],
) {
  const toolOutputs = steps
    .flatMap((step) => step.toolResults)
    .filter((result) => result.toolName === "grade_student_work")
    .map((result) => result.output)
    .filter(
      (output): output is {
        quizId?: string;
        conceptKey?: string;
        studentAnswerSummary?: string;
        score?: number;
        feedback?: string;
        masteryLevel?: string;
      } => typeof output === "object" && output !== null,
    );

  return toolOutputs.at(-1) ?? null;
}

export async function finalizeTutoringTurn(params: FinalizeTutoringTurnParams) {
  const timer = createTutoringTimer();
  const lastStep = params.result.steps.at(-1);
  const assistantText = normalizeTutorResponseText(lastStep?.text ?? "");
  const formatWarnings = formatTutorResponseWarnings(assistantText);
  logTutoringDebug("turn:finalize:start", {
    topicId: params.topicId,
    tutorSessionId: params.tutorSessionId,
    stepCount: params.result.steps.length,
    assistantText: assistantText ? summarizeTutoringText(assistantText, 180) : null,
    formatWarnings,
    previousAssistantText: params.previousAssistantText
      ? summarizeTutoringText(params.previousAssistantText, 180)
      : null,
    durationMs: timer.elapsedMs(),
  });
  if (!assistantText) {
    logTutoringWarn("turn:finalize:empty-assistant-text", {
      topicId: params.topicId,
      tutorSessionId: params.tutorSessionId,
      stepCount: params.result.steps.length,
    });
    return;
  }

  if (formatWarnings.length > 0) {
    logTutoringWarn("turn:finalize:format-warning", {
      topicId: params.topicId,
      tutorSessionId: params.tutorSessionId,
      formatWarnings,
      assistantText: summarizeTutoringText(assistantText, 180),
    });
  }

  const latestAssessment = getLatestAssessmentResult(params.result.steps);
  const evidence = [...params.prepared.nextState.recentEvidence];
  evidence.push(params.latestUserText);
  evidence.push(assistantText);

  if (latestAssessment?.score !== undefined) {
    evidence.push(`Assessment score: ${latestAssessment.score}`);
  }
  if (latestAssessment?.masteryLevel) {
    evidence.push(`Assessment mastery: ${latestAssessment.masteryLevel}`);
  }
  if (latestAssessment?.conceptKey) {
    evidence.push(`Assessment concept: ${latestAssessment.conceptKey}`);
  }
  if (latestAssessment?.studentAnswerSummary) {
    evidence.push(`Assessment evidence: ${latestAssessment.studentAnswerSummary}`);
  }
  const nextState = {
    ...params.prepared.nextState,
    recentEvidence: evidence.slice(-12),
    recentMessageSummary: [params.latestUserText, assistantText].join("\n").slice(-1200),
    turnCount: params.state.turnCount + 1,
  };
  logTutoringDebug("turn:finalize:next-state", {
    topicId: params.topicId,
    tutorSessionId: params.tutorSessionId,
    turnCount: nextState.turnCount,
    evidenceCount: nextState.recentEvidence.length,
    frameworkVersionId: params.prepared.activeFramework.frameworkVersionId,
    durationMs: timer.elapsedMs(),
  });

  await measureTutoringStep(
    "turn:finalize:persist",
    {
      topicId: params.topicId,
      tutorSessionId: params.tutorSessionId,
      expectedStateVersion: params.expectedStateVersion,
    },
    async () =>
      await persistTutorTurnOutcome({
        sessionId: params.tutorSessionId,
        classroomStudentId: params.access.classroomStudent.id,
        topicId: params.topicId,
        assistantText,
        assistantMetadata: {
          frameworkVersionId: params.prepared.activeFramework.frameworkVersionId,
          toolCalls: params.result.steps.flatMap((step) => step.toolCalls),
        },
        interactionMetadata: {},
        nextState,
        expectedStateVersion: params.expectedStateVersion,
      }),
  );
  logTutoringDebug("turn:finalize:persisted", {
    topicId: params.topicId,
    tutorSessionId: params.tutorSessionId,
    expectedStateVersion: params.expectedStateVersion,
    durationMs: timer.elapsedMs(),
  });

  await logBraintrustTrace({
    event: "tutoring_turn",
    input: {
      topicId: params.topicId,
      sessionId: params.tutorSessionId,
      studentMessage: params.latestUserText,
    },
    output: { tutorMessage: assistantText, steps: params.result.steps.length },
    metadata: {
      topicId: params.topicId,
      frameworkVersion: params.prepared.activeFramework.frameworkVersionId,
      materialIds: params.prepared.contentScope.materialIds,
      conflictState:
        params.prepared.activeFramework.openConflicts.length > 0 ? "open" : "clear",
      toolUse: params.result.steps.some((step) => step.toolCalls.length > 0),
      mem0State: params.prepared.teachingPlaybookState.status,
    },
  }).catch(() => undefined);
  logTutoringDebug("turn:finalize:braintrust-trace-requested", {
    topicId: params.topicId,
    tutorSessionId: params.tutorSessionId,
    durationMs: timer.elapsedMs(),
  });
}
