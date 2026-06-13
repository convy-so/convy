import { nanoid } from "nanoid";

import { analysisModel, generateAIResponse } from "@/lib/ai";
import { safeJsonParse } from "@/lib/ai/json";
import {
  buildConductingTurnEvaluationPrompt,
  buildConductingTurnPlanPrompt,
} from "../prompts/conducting-runtime";
import {
  listEvidenceForSession,
  listSessionTurns,
  replaceEvidence,
  replaceSessionTurns,
  updateSessionState,
} from "../storage";
import type {
  CoveragePlan,
  EvidenceRecord,
  ResearchBrief,
  SessionState,
} from "../types";

type ChatMessage = {
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
};

type TurnAnalysisResult = {
  nodeCoverage?: Record<string, number>;
  completedNodeIds?: string[];
  evidence?: Array<{
    nodeId: string;
    evidenceType: string;
    excerpt: string;
    sentiment?: "positive" | "negative" | "neutral" | "mixed";
    reliability?: number;
  }>;
  contradictions?: string[];
  fatigueScore?: number;
  reliabilityScore?: number;
  notes?: string[];
  shouldStop?: boolean;
};

type DeriveNextSessionStateInput = {
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  messages: ChatMessage[];
  analysis: TurnAnalysisResult | null;
};

export type ConductingTurnPlan = {
  action: "probe_same_node" | "advance_to_node" | "close";
  targetNodeId: string | null;
  probeType:
    | "example"
    | "mechanism"
    | "barrier"
    | "confidence"
    | "comparison"
    | "clarify"
    | "confirm"
    | null;
  reason: string;
  missingEvidence: string[];
  avoidRepeating: string[];
  assistantMessage: string;
  completionReadiness: number;
  fatigueLevel: "low" | "medium" | "high";
};

type ResolveTurnPlanInput = {
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  messages: ChatMessage[];
  plan: ConductingTurnPlan | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTurnAnalysisResult(value: unknown): TurnAnalysisResult | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    nodeCoverage: isRecord(value.nodeCoverage)
      ? Object.fromEntries(
          Object.entries(value.nodeCoverage).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number",
          ),
        )
      : undefined,
    completedNodeIds: Array.isArray(value.completedNodeIds)
      ? value.completedNodeIds.filter(
          (item): item is string => typeof item === "string",
        )
      : undefined,
    evidence: Array.isArray(value.evidence)
      ? value.evidence.flatMap((item) => {
          if (!isRecord(item)) {
            return [];
          }

          const nodeId = typeof item.nodeId === "string" ? item.nodeId : null;
          const evidenceType =
            typeof item.evidenceType === "string" ? item.evidenceType : null;
          const excerpt = typeof item.excerpt === "string" ? item.excerpt : null;
          const reliability =
            typeof item.reliability === "number" ? item.reliability : undefined;
          const sentiment =
            item.sentiment === "positive" ||
            item.sentiment === "negative" ||
            item.sentiment === "neutral" ||
            item.sentiment === "mixed"
              ? item.sentiment
              : undefined;

          if (!nodeId || !evidenceType || !excerpt) {
            return [];
          }

          return [
            {
              nodeId,
              evidenceType,
              excerpt,
              sentiment,
              reliability,
            },
          ];
        })
      : undefined,
    contradictions: Array.isArray(value.contradictions)
      ? value.contradictions.filter(
          (item): item is string => typeof item === "string",
        )
      : undefined,
    fatigueScore:
      typeof value.fatigueScore === "number" ? value.fatigueScore : undefined,
    reliabilityScore:
      typeof value.reliabilityScore === "number"
        ? value.reliabilityScore
        : undefined,
    notes: Array.isArray(value.notes)
      ? value.notes.filter((item): item is string => typeof item === "string")
      : undefined,
    shouldStop:
      typeof value.shouldStop === "boolean" ? value.shouldStop : undefined,
  };
}

function normalizeConductingTurnPlan(
  value: unknown,
  coveragePlan: CoveragePlan,
): ConductingTurnPlan | null {
  if (!isRecord(value) || typeof value.action !== "string") {
    return null;
  }

  const validActions = new Set([
    "probe_same_node",
    "advance_to_node",
    "close",
  ]);
  if (!validActions.has(value.action)) {
    return null;
  }

  const targetNodeId =
    typeof value.targetNodeId === "string" &&
    coveragePlan.nodes.some((node) => node.id === value.targetNodeId)
      ? value.targetNodeId
      : null;
  const probeType =
    value.probeType === "example" ||
    value.probeType === "mechanism" ||
    value.probeType === "barrier" ||
    value.probeType === "confidence" ||
    value.probeType === "comparison" ||
    value.probeType === "clarify" ||
    value.probeType === "confirm"
      ? value.probeType
      : null;

  return {
    action: value.action as ConductingTurnPlan["action"],
    targetNodeId,
    probeType,
    reason: typeof value.reason === "string" ? value.reason : "",
    missingEvidence: Array.isArray(value.missingEvidence)
      ? value.missingEvidence.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    avoidRepeating: Array.isArray(value.avoidRepeating)
      ? value.avoidRepeating.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    assistantMessage:
      typeof value.assistantMessage === "string" ? value.assistantMessage : "",
    completionReadiness:
      typeof value.completionReadiness === "number"
        ? Math.max(0, Math.min(1, value.completionReadiness))
        : 0,
    fatigueLevel:
      value.fatigueLevel === "high" ||
      value.fatigueLevel === "medium" ||
      value.fatigueLevel === "low"
        ? value.fatigueLevel
        : "low",
  };
}

export function resolveActiveCoverageNode(
  state: Pick<SessionState, "currentNodeId">,
  plan: CoveragePlan,
) {
  return (
    plan.nodes.find((node) => node.id === state.currentNodeId) ?? plan.nodes[0] ?? null
  );
}

function chooseNextNode(state: SessionState, plan: CoveragePlan): string | null {
  const remaining = plan.nodes
    .filter((node) => !state.completedNodeIds.includes(node.id))
    .sort((a, b) => b.priority - a.priority);
  return remaining[0]?.id ?? null;
}

function summarizeConversation(messages: ChatMessage[]) {
  return messages
    .filter(
      (message) => message.role === "user" || message.role === "assistant",
    )
    .slice(-6)
    .map(
      (message) =>
        `${message.role === "user" ? "Respondent" : "Interviewer"}: ${message.content}`,
    )
    .join("\n");
}

function normalizeMessageForComparison(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuestionText(message: ChatMessage) {
  if (message.role !== "assistant") {
    return null;
  }
  const content = message.content.trim();
  return content.includes("?") ? content : null;
}

function getRecentAssistantQuestionShapes(messages: ChatMessage[]) {
  return messages
    .map(extractQuestionText)
    .filter((value): value is string => Boolean(value))
    .slice(-2)
    .map(normalizeMessageForComparison);
}

function inferProbeSignal(question: string): ConductingTurnPlan["probeType"] {
  const normalized = normalizeMessageForComparison(question);
  if (/\b(example|specific time|walk me through|happened)\b/.test(normalized)) {
    return "example";
  }
  if (/\b(what about|made the difference|why|cause)\b/.test(normalized)) {
    return "mechanism";
  }
  if (/\b(harder|barrier|got in the way|blocked|difficult)\b/.test(normalized)) {
    return "barrier";
  }
  if (/\b(confident|sure|on your own)\b/.test(normalized)) {
    return "confidence";
  }
  if (/\b(before|after|different|compared)\b/.test(normalized)) {
    return "comparison";
  }
  if (/\b(confirm|just to confirm)\b/.test(normalized)) {
    return "confirm";
  }
  if (/\b(unclear|clarify|mean)\b/.test(normalized)) {
    return "clarify";
  }
  return null;
}

function getRecentProbeSignals(messages: ChatMessage[]) {
  return messages
    .map(extractQuestionText)
    .filter((value): value is string => Boolean(value))
    .slice(-4)
    .map(inferProbeSignal)
    .filter((value): value is NonNullable<ConductingTurnPlan["probeType"]> =>
      Boolean(value),
    );
}

function buildSingleQuestion(targetNodeLabel: string, probeType: ConductingTurnPlan["probeType"]) {
  switch (probeType) {
    case "barrier":
      return `What specifically made ${targetNodeLabel.toLowerCase()} harder to sustain?`;
    case "mechanism":
      return `What was it about ${targetNodeLabel.toLowerCase()} that made the difference?`;
    case "comparison":
      return `How was ${targetNodeLabel.toLowerCase()} different before versus after the program?`;
    case "confidence":
      return `How confident do you feel using ${targetNodeLabel.toLowerCase()} on your own now?`;
    case "clarify":
      return `What was the main part of ${targetNodeLabel.toLowerCase()} that felt unclear?`;
    case "confirm":
      return `Just to confirm, was ${targetNodeLabel.toLowerCase()} consistently useful or only in specific situations?`;
    case "example":
    default:
      return `Can you share one specific example of ${targetNodeLabel.toLowerCase()} in practice?`;
  }
}

function buildFallbackConductingTurnPlan(
  state: SessionState,
  plan: CoveragePlan,
): ConductingTurnPlan {
  const activeNode = resolveActiveCoverageNode(state, plan);
  const nextNodeId = chooseNextNode(state, plan);
  const coverageReady =
    state.overallCoverage >= plan.completionRule.minimumRequiredNodeCoverage;
  const reliabilityReady =
    state.reliabilityScore >= plan.completionRule.minimumReliability;

  if ((coverageReady && reliabilityReady) || state.fatigueScore >= 0.85 || !nextNodeId) {
    return {
      action: "close",
      targetNodeId: null,
      probeType: null,
      reason: "Fallback planner closed because coverage is sufficient, fatigue is high, or no required node remains.",
      missingEvidence: [],
      avoidRepeating: [],
      assistantMessage: "Thank you. That gives me enough to close the interview.",
      completionReadiness: coverageReady && reliabilityReady ? 1 : 0.75,
      fatigueLevel:
        state.fatigueScore >= 0.85
          ? "high"
          : state.fatigueScore >= 0.5
            ? "medium"
            : "low",
    };
  }

  const activeCoverage = activeNode
    ? Math.min(1, state.coverageByNode[activeNode.id] ?? 0)
    : 0;
  if (activeNode && activeCoverage < activeNode.completionThreshold) {
    return {
      action: "probe_same_node",
      targetNodeId: activeNode.id,
      probeType: "example",
      reason: "Fallback planner kept the active node open because it is still below threshold.",
      missingEvidence: ["concrete example"],
      avoidRepeating: [],
      assistantMessage: buildSingleQuestion(activeNode.label, "example"),
      completionReadiness: Math.max(0, Math.min(1, state.overallCoverage)),
      fatigueLevel:
        state.fatigueScore >= 0.75
          ? "high"
          : state.fatigueScore >= 0.4
            ? "medium"
            : "low",
    };
  }

  const nextNode = plan.nodes.find((node) => node.id === nextNodeId) ?? activeNode;
  return {
    action: "advance_to_node",
    targetNodeId: nextNode?.id ?? null,
    probeType: "example",
    reason: "Fallback planner advanced because the active node appears sufficiently covered.",
    missingEvidence: [],
    avoidRepeating: [],
    assistantMessage: nextNode
      ? buildSingleQuestion(nextNode.label, "example")
      : "Can you share one specific example from your experience?",
    completionReadiness: Math.max(0, Math.min(1, state.overallCoverage)),
    fatigueLevel:
      state.fatigueScore >= 0.75
        ? "high"
        : state.fatigueScore >= 0.4
          ? "medium"
          : "low",
  };
}

export function resolveConductingTurnPlan(
  input: ResolveTurnPlanInput,
): ConductingTurnPlan {
  const fallbackPlan = buildFallbackConductingTurnPlan(
    input.sessionState,
    input.coveragePlan,
  );
  const candidate = input.plan ?? fallbackPlan;
  const activeNode = resolveActiveCoverageNode(
    input.sessionState,
    input.coveragePlan,
  );
  const targetNode =
    (candidate.targetNodeId &&
      input.coveragePlan.nodes.find((node) => node.id === candidate.targetNodeId)) ||
    activeNode ||
    input.coveragePlan.nodes[0] ||
    null;
  const targetCoverage = targetNode
    ? Math.min(1, input.sessionState.coverageByNode[targetNode.id] ?? 0)
    : 0;
  const coverageReady =
    input.sessionState.overallCoverage >=
    input.coveragePlan.completionRule.minimumRequiredNodeCoverage;
  const reliabilityReady =
    input.sessionState.reliabilityScore >=
    input.coveragePlan.completionRule.minimumReliability;
  const recentQuestionShapes = getRecentAssistantQuestionShapes(input.messages);
  const recentProbeSignals = getRecentProbeSignals(input.messages);

  let resolved: ConductingTurnPlan = {
    ...candidate,
    targetNodeId:
      candidate.action === "close" ? null : (targetNode?.id ?? candidate.targetNodeId),
    assistantMessage: candidate.assistantMessage.trim(),
  };

  if (coverageReady && reliabilityReady) {
    resolved = {
      ...resolved,
      action: "close",
      targetNodeId: null,
      probeType: null,
      reason: resolved.reason || "Coverage and reliability already satisfy the completion rule.",
      assistantMessage:
        resolved.assistantMessage && !resolved.assistantMessage.includes("?")
          ? resolved.assistantMessage
          : "Thank you. That gives me enough to close the interview.",
    };
  } else if (
    resolved.action === "probe_same_node" &&
    targetNode &&
    targetCoverage >= targetNode.completionThreshold
  ) {
    const nextNodeId = chooseNextNode(
      {
        ...input.sessionState,
        completedNodeIds: Array.from(
          new Set([...input.sessionState.completedNodeIds, targetNode.id]),
        ),
      },
      input.coveragePlan,
    );
    resolved = nextNodeId
      ? {
          ...resolved,
          action: "advance_to_node",
          targetNodeId: nextNodeId,
          probeType: "example",
          reason:
            resolved.reason ||
            "The target node already meets threshold, so the interview should advance.",
        }
      : {
          ...resolved,
          action: "close",
          targetNodeId: null,
          probeType: null,
          reason:
            resolved.reason ||
            "The target node already meets threshold and no required node remains.",
        };
  }

  const normalizedAssistantMessage = normalizeMessageForComparison(
    resolved.assistantMessage,
  );
  if (
    resolved.action !== "close" &&
    normalizedAssistantMessage &&
    (recentQuestionShapes.includes(normalizedAssistantMessage) ||
      (resolved.probeType !== null && recentProbeSignals.includes(resolved.probeType)))
  ) {
    resolved = {
      ...resolved,
      reason: `${resolved.reason} Avoided repeating the same question shape.`,
      probeType: resolved.probeType === "example" ? "mechanism" : resolved.probeType,
      assistantMessage:
        targetNode?.label
          ? buildSingleQuestion(
              targetNode.label,
              resolved.probeType === "example" ? "mechanism" : resolved.probeType,
            )
          : resolved.assistantMessage,
    };
  }

  if (resolved.action === "close") {
    if (!resolved.assistantMessage || resolved.assistantMessage.includes("?")) {
      resolved = {
        ...resolved,
        assistantMessage: "Thank you. That gives me enough to close the interview.",
      };
    }
  } else {
    if (!resolved.assistantMessage || !resolved.assistantMessage.includes("?")) {
      resolved = {
        ...resolved,
        assistantMessage: targetNode?.label
          ? buildSingleQuestion(targetNode.label, resolved.probeType)
          : "Can you share one specific example from your experience?",
      };
    }
  }

  return resolved;
}

export function deriveNextConductingSessionState(
  input: DeriveNextSessionStateInput,
) {
  const mergedCoverageByNode = {
    ...input.sessionState.coverageByNode,
    ...(input.analysis?.nodeCoverage ?? {}),
  };
  const thresholdCompletedNodeIds = input.coveragePlan.nodes
    .filter(
      (node) => Math.min(1, mergedCoverageByNode[node.id] ?? 0) >= node.completionThreshold,
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
    notes: [...input.sessionState.notes, ...((input.analysis?.notes ?? []).filter(Boolean))].slice(-20),
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

async function evaluateTurn(input: {
  surveyId: string;
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  messages: ChatMessage[];
}) {
  const activeNode = resolveActiveCoverageNode(
    input.sessionState,
    input.coveragePlan,
  );
  const prompt = buildConductingTurnEvaluationPrompt({
    brief: input.brief,
    coveragePlan: input.coveragePlan,
    messages: input.messages,
    activeNode,
  });

  const raw = await generateAIResponse(prompt, undefined, {
    model: analysisModel,
    temperature: 0.1,
    maxTokens: 1200,
    attribution: {
      surveyId: input.surveyId,
      feature: "survey-conducting-turn-evaluation",
    },
  });

  return normalizeTurnAnalysisResult(safeJsonParse(raw));
}

function buildEvidenceRecords(input: {
  surveyId: string;
  sessionId: string;
  analysis: TurnAnalysisResult | null;
  nextState: SessionState;
}) {
  return (input.analysis?.evidence ?? [])
    .filter((item) => item.nodeId && item.excerpt)
    .map((item, index) => ({
      id: nanoid(),
      surveyId: input.surveyId,
      sessionId: input.sessionId,
      nodeId: item.nodeId,
      evidenceType: item.evidenceType,
      excerpt: item.excerpt,
      sentiment: item.sentiment,
      reliability: Math.max(
        0,
        Math.min(
          100,
          item.reliability ?? Math.round(input.nextState.reliabilityScore * 100),
        ),
      ),
      metadata: { source: "turn_analysis", index },
    })) satisfies EvidenceRecord[];
}

export async function evaluateConductingTurnState(input: {
  surveyId: string;
  sessionId: string;
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  messages: ChatMessage[];
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

export async function planConductingTurn(input: {
  surveyId: string;
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  messages: ChatMessage[];
}) {
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

export async function finalizeConductingTurn(input: {
  surveyId: string;
  sessionId: string;
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  messages: ChatMessage[];
}) {
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
