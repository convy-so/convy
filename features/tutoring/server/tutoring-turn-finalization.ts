import { logBraintrustTrace } from "@/shared/ai/braintrust";
import { persistTutorTurnOutcome } from "@/features/tutoring/public-server";
import { finalizeTutoringSession } from "@/features/tutoring/server/tutoring-session-lifecycle";
import {
  formatTutorResponseWarnings,
  normalizeTutorResponseText,
} from "@/features/tutoring/server/tutor-response-format";
import {
  logTutoringDebug,
  logTutoringWarn,
  summarizeTutoringText,
  createTutoringTimer,
  measureTutoringStep,
} from "@/features/tutoring/public-server";
import { TUTORING_COMPLETION_REASON } from "@/shared/learning/constants";

import type { FinalizeTutoringTurnParams } from "@/features/tutoring/server/tutoring-turn-types";

const CONFLICT_STATE = {
  OPEN: "open",
  CLEAR: "clear",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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

function getLatestFinishSessionResult(
  steps: FinalizeTutoringTurnParams["result"]["steps"],
) {
  const toolOutputs = steps
    .flatMap((step) => step.toolResults)
    .filter((result) => result.toolName === "finish_session")
    .map((result) => result.output)
    .filter(
      (output): output is {
        success?: boolean;
        completionRationale?: string;
        coveredOutcomes?: string[];
        evidenceSummary?: string;
        nextStepNote?: string;
      } => isRecord(output),
    );

  return [...toolOutputs].reverse().find((output) => output.success === true) ?? null;
}

function shouldShowToolOutput(toolName: string, output: unknown) {
  if (!isRecord(output)) {
    return false;
  }

  if (output.success === false) {
    return false;
  }

  if (toolName === "search_image" || toolName === "search_video") {
    return output.success === true;
  }

  return [
    "administer_quiz",
    "grade_student_work",
    "finish_session",
  ].includes(toolName);
}

function serializeAssistantParts(input: {
  assistantText: string;
  steps: FinalizeTutoringTurnParams["result"]["steps"];
}) {
  const parts: Array<Record<string, unknown>> = [];
  if (input.assistantText.trim()) {
    parts.push({ type: "text", text: input.assistantText });
  }

  input.steps.forEach((step, stepIndex) => {
    step.toolResults.forEach((result, resultIndex) => {
      if (!shouldShowToolOutput(result.toolName, result.output)) {
        return;
      }

      const matchingCall = step.toolCalls.find(
        (call) =>
          call.toolCallId === result.toolCallId ||
          call.toolName === result.toolName,
      );

      parts.push({
        type: "dynamic-tool",
        toolName: result.toolName,
        toolCallId:
          result.toolCallId ??
          matchingCall?.toolCallId ??
          `${result.toolName}-${stepIndex}-${resultIndex}`,
        state: "output-available",
        input: result.input ?? matchingCall?.input ?? matchingCall?.args ?? {},
        output: result.output,
      });
    });
  });

  return parts;
}

export async function finalizeTutoringTurn(params: FinalizeTutoringTurnParams) {
  const timer = createTutoringTimer();
  const lastStep = params.result.steps.at(-1);
  const finishSessionResult = getLatestFinishSessionResult(params.result.steps);
  const assistantText = normalizeTutorResponseText(
    lastStep?.text || finishSessionResult?.nextStepNote || "",
  );
  const assistantParts = serializeAssistantParts({
    assistantText,
    steps: params.result.steps,
  });
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
  if (!assistantText && assistantParts.length === 0) {
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
  if (finishSessionResult) {
    evidence.push(`Completion rationale: ${finishSessionResult.completionRationale ?? ""}`);
    evidence.push(`Completion evidence: ${finishSessionResult.evidenceSummary ?? ""}`);
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
    frameworkId: params.prepared.activeFramework.frameworkId,
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
        assistantParts,
        assistantMetadata: {
          frameworkId: params.prepared.activeFramework.frameworkId,
          toolCalls: params.result.steps.flatMap((step) => step.toolCalls),
          toolResults: params.result.steps.flatMap((step) => step.toolResults),
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

  if (finishSessionResult) {
    await measureTutoringStep(
      "turn:finalize:finish-session",
      {
        topicId: params.topicId,
        tutorSessionId: params.tutorSessionId,
        expectedStateVersion: params.expectedStateVersion + 1,
      },
      async () =>
        await finalizeTutoringSession({
          sessionId: params.tutorSessionId,
          topicId: params.topicId,
          classroomId: params.access.topic.classroomId,
          classroomStudentId: params.access.classroomStudent.id,
          studentUserId: params.sessionUserId,
          studentName: params.access.classroomStudent.fullName,
          topicTitle: params.access.topic.title,
          courseId: params.access.topic.courseId,
          courseTitle: params.access.topic.course.title,
          sourceLocale: params.access.topic.contentLocale,
          summary:
            finishSessionResult.completionRationale ??
            params.state.recentMessageSummary ??
            null,
          expectedStateVersion: params.expectedStateVersion + 1,
          state: nextState,
          reason: TUTORING_COMPLETION_REASON.TUTOR_FINISHED,
        }),
    );
    logTutoringDebug("turn:finalize:finish-session:completed", {
      topicId: params.topicId,
      tutorSessionId: params.tutorSessionId,
      durationMs: timer.elapsedMs(),
    });
  }

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
      frameworkId: params.prepared.activeFramework.frameworkId,
      materialIds: params.prepared.contentScope.materialIds,
      conflictState:
        params.prepared.activeFramework.openConflicts.length > 0
          ? CONFLICT_STATE.OPEN
          : CONFLICT_STATE.CLEAR,
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
