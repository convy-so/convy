import { analysisModel, generateAIResponse } from "@/shared/ai";
import { safeJsonParse } from "@/shared/ai/json-object-parser";
import { buildConductingTurnPlanPrompt } from "../prompts/conducting-runtime";
import {
  listEvidenceForSession,
  listSessionTurns,
  replaceEvidence,
  replaceSessionTurns,
  updateSessionState,
} from "../storage";
import type { SessionState } from "../types";
import type {
  ChatMessage,
  ConductingTurnInput,
  DeriveNextSessionStateInput,
} from "./turn-runtime-models";
import { buildEvidenceRecords, evaluateTurn } from "./turn-runtime-evaluation";
import {
  chooseNextNode,
  resolveActiveCoverageNode,
  summarizeConversation,
} from "./turn-runtime-plan-helpers";
import { normalizeConductingTurnPlan } from "./turn-runtime-normalizers";

export type {
  ChatMessage,
  ConductingTurnPlan,
  TurnAnalysisResult,
} from "./turn-runtime-models";
export { resolveActiveCoverageNode, resolveConductingTurnPlan } from "./turn-runtime-plan-helpers";

export function deriveNextConductingSessionState(
  input: DeriveNextSessionStateInput,
) {
  const mergedCoverageByNode = {
    ...input.sessionState.coverageByNode,
    ...(input.analysis?.nodeCoverage ?? {}),
  };
  const thresholdCompletedNodeIds = input.coveragePlan.nodes
    .filter(
      (node) =>
        Math.min(1, mergedCoverageByNode[node.id] ?? 0) >=
        node.completionThreshold,
    )
    .map((node) => node.id);
  const nextState: SessionState = {
    ...input.sessionState,
    coverageByNode: mergedCoverageByNode,
    completedNodeIds: Array.from(
      new Set([
        ...input.sessionState.completedNodeIds,
        ...thresholdCompletedNodeIds,
        ...((input.analysis?.completedNodeIds ?? []).filter(Boolean)),
      ]),
    ),
    fatigueScore: Math.max(
      0,
      Math.min(1, input.analysis?.fatigueScore ?? input.sessionState.fatigueScore),
    ),
    reliabilityScore: Math.max(
      0,
      Math.min(
        1,
        input.analysis?.reliabilityScore ?? input.sessionState.reliabilityScore,
      ),
    ),
    contradictions: Array.from(
      new Set([
        ...input.sessionState.contradictions,
        ...((input.analysis?.contradictions ?? []).filter(Boolean)),
      ]),
    ),
    notes: [
      ...input.sessionState.notes,
      ...((input.analysis?.notes ?? []).filter(Boolean)),
    ].slice(-20),
  };

  nextState.pendingNodeIds = input.coveragePlan.nodes
    .map((node) => node.id)
    .filter((nodeId) => !nextState.completedNodeIds.includes(nodeId));
  nextState.overallCoverage = input.coveragePlan.nodes.length
    ? input.coveragePlan.nodes.reduce(
        (sum, node) => sum + Math.min(1, nextState.coverageByNode[node.id] ?? 0),
        0,
      ) / input.coveragePlan.nodes.length
    : 0;
  nextState.currentNodeId = chooseNextNode(nextState, input.coveragePlan);
  nextState.conversationSummary = summarizeConversation(input.messages);
  nextState.summaryVersion = input.sessionState.summaryVersion + 1;

  const coverageReady =
    nextState.overallCoverage >=
    input.coveragePlan.completionRule.minimumRequiredNodeCoverage;
  const reliabilityReady =
    nextState.reliabilityScore >=
    input.coveragePlan.completionRule.minimumReliability;
  const fatigueForcedStop =
    Boolean(input.analysis?.shouldStop) && nextState.fatigueScore >= 0.85;
  const shouldStop =
    fatigueForcedStop ||
    (Boolean(input.analysis?.shouldStop) && coverageReady && reliabilityReady) ||
    (!nextState.currentNodeId && coverageReady && reliabilityReady);

  if (shouldStop) {
    nextState.status = "completed";
    nextState.stopReason = input.analysis?.shouldStop
      ? "analysis_stop_signal"
      : "coverage_complete";
  }

  nextState.activeWorkflowDecision = {
    activeNodeId: shouldStop ? null : nextState.currentNodeId,
    rationale: shouldStop
      ? "Workflow stop condition reached from coverage or fatigue signal."
      : `Continue with ${nextState.currentNodeId ?? "the next open node"} because it is still required and not yet complete.`,
    shouldStop,
  };
  nextState.contextBudgetSnapshot = {
    summaryTokens: Math.ceil(nextState.conversationSummary.length / 4),
    evidenceCount: (input.analysis?.evidence ?? []).length,
    pendingNodeCount: nextState.pendingNodeIds.length,
  };

  return {
    nextState,
    coverageReady,
    reliabilityReady,
    fatigueForcedStop,
    shouldStop,
  };
}

export async function evaluateConductingTurnState(input: ConductingTurnInput & {
  sessionId: string;
}) {
  const analysis = await evaluateTurn(input);
  const { nextState, coverageReady, reliabilityReady, fatigueForcedStop, shouldStop } =
    deriveNextConductingSessionState({
      coveragePlan: input.coveragePlan,
      sessionState: input.sessionState,
      messages: input.messages,
      analysis,
    });
  const evidence = buildEvidenceRecords({
    surveyId: input.surveyId,
    sessionId: input.sessionId,
    analysis,
    nextState,
  });

  await updateSessionState(input.sessionId, nextState);
  await replaceEvidence(input.sessionId, input.surveyId, evidence);

  return {
    analysis,
    nextState,
    evidence,
    coverageReady,
    reliabilityReady,
    fatigueForcedStop,
    shouldStop,
  };
}

export async function persistConductingTurnTranscript(input: {
  surveyId: string;
  sessionId: string;
  messages: ChatMessage[];
}) {
  await replaceSessionTurns({
    surveyId: input.surveyId,
    sessionId: input.sessionId,
    turns: input.messages.map((message, index) => ({
      id: `${input.sessionId}-turn-${index + 1}`,
      role: message.role,
      content: message.content,
      sourceMessageId: message.id,
    })),
  });
}

export async function planConductingTurn(input: ConductingTurnInput) {
  const activeNode = resolveActiveCoverageNode(
    input.sessionState,
    input.coveragePlan,
  );
  const prompt = buildConductingTurnPlanPrompt({
    brief: input.brief,
    coveragePlan: input.coveragePlan,
    messages: input.messages,
    activeNode,
    sessionState: {
      currentNodeId: input.sessionState.currentNodeId,
      completedNodeIds: input.sessionState.completedNodeIds,
      coverageByNode: input.sessionState.coverageByNode,
      overallCoverage: input.sessionState.overallCoverage,
      fatigueScore: input.sessionState.fatigueScore,
      reliabilityScore: input.sessionState.reliabilityScore,
      contradictions: input.sessionState.contradictions,
      conversationSummary: input.sessionState.conversationSummary,
    },
    language: input.sessionState.language,
  });

  const raw = await generateAIResponse(prompt, undefined, {
    model: analysisModel,
    temperature: 0.1,
    maxTokens: 900,
    attribution: {
      surveyId: input.surveyId,
      feature: "survey-conducting-turn-planning",
    },
  });

  return normalizeConductingTurnPlan(safeJsonParse(raw), input.coveragePlan);
}

export async function finalizeConductingTurn(
  input: ConductingTurnInput & { sessionId: string },
) {
  const { nextState, evidence } = await evaluateConductingTurnState(input);
  await persistConductingTurnTranscript({
    surveyId: input.surveyId,
    sessionId: input.sessionId,
    messages: input.messages,
  });

  return { nextState, evidence };
}

export async function buildEvidenceSummary(sessionId: string) {
  const evidence = await listEvidenceForSession(sessionId);
  if (evidence.length === 0) return "No evidence captured yet.";
  return evidence
    .slice(0, 12)
    .map((item) => `- ${item.nodeId}: ${item.excerpt}`)
    .join("\n");
}

export async function buildSessionTranscript(sessionId: string) {
  const turns = await listSessionTurns(sessionId);
  return turns
    .map(
      (turn) =>
        `${turn.role === "user" ? "Participant" : "Interviewer"}: ${turn.content}`,
    )
    .join("\n\n");
}
