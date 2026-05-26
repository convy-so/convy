import { logBraintrustTrace } from "@/lib/ai/braintrust";
import { persistTutorTurnOutcome } from "@/lib/learning/storage";

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
        score?: number;
        feedback?: string;
        masteryLevel?: string;
      } => typeof output === "object" && output !== null,
    );

  return toolOutputs.at(-1) ?? null;
}

export async function finalizeTutoringTurn(params: FinalizeTutoringTurnParams) {
  const lastStep = params.result.steps.at(-1);
  const assistantText = lastStep?.text?.trim();
  if (!assistantText) return;

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

  const nextState = {
    ...params.prepared.nextState,
    recentEvidence: evidence.slice(-12),
    recentMessageSummary: [params.latestUserText, assistantText].join("\n").slice(-1200),
    turnCount: params.state.turnCount + 1,
  };

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
}
