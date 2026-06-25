import type { CoveragePlan, SessionState } from "../types";
import type {
  ChatMessage,
  ConductingTurnPlan,
  ResolveTurnPlanInput,
} from "./turn-runtime-models";

export function resolveActiveCoverageNode(
  state: Pick<SessionState, "currentNodeId">,
  plan: CoveragePlan,
) {
  return (
    plan.nodes.find((node) => node.id === state.currentNodeId) ??
    plan.nodes[0] ??
    null
  );
}

export function chooseNextNode(state: SessionState, plan: CoveragePlan) {
  const remaining = plan.nodes
    .filter((node) => !state.completedNodeIds.includes(node.id))
    .sort((a, b) => b.priority - a.priority);
  return remaining[0]?.id ?? null;
}

export function summarizeConversation(messages: ChatMessage[]) {
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

function buildSingleQuestion(
  targetNodeLabel: string,
  probeType: ConductingTurnPlan["probeType"],
) {
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

  if (
    (coverageReady && reliabilityReady) ||
    state.fatigueScore >= 0.85 ||
    !nextNodeId
  ) {
    return {
      action: "close",
      targetNodeId: null,
      probeType: null,
      reason:
        "Fallback planner closed because coverage is sufficient, fatigue is high, or no required node remains.",
      missingEvidence: [],
      avoidRepeating: [],
      assistantMessage:
        "Thank you. That gives me enough to close the interview.",
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
      reason:
        "Fallback planner kept the active node open because it is still below threshold.",
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
    reason:
      "Fallback planner advanced because the active node appears sufficiently covered.",
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
      reason:
        resolved.reason ||
        "Coverage and reliability already satisfy the completion rule.",
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
      (resolved.probeType !== null &&
        recentProbeSignals.includes(resolved.probeType)))
  ) {
    resolved = {
      ...resolved,
      reason: `${resolved.reason} Avoided repeating the same question shape.`,
      probeType: resolved.probeType === "example" ? "mechanism" : resolved.probeType,
      assistantMessage:
        targetNode?.label
          ? buildSingleQuestion(
              targetNode.label,
              resolved.probeType === "example"
                ? "mechanism"
                : resolved.probeType,
            )
          : resolved.assistantMessage,
    };
  }

  if (resolved.action === "close") {
    if (!resolved.assistantMessage || resolved.assistantMessage.includes("?")) {
      resolved = {
        ...resolved,
        assistantMessage:
          "Thank you. That gives me enough to close the interview.",
      };
    }
  } else if (
    !resolved.assistantMessage ||
    !resolved.assistantMessage.includes("?")
  ) {
    resolved = {
      ...resolved,
      assistantMessage: targetNode?.label
        ? buildSingleQuestion(targetNode.label, resolved.probeType)
        : "Can you share one specific example from your experience?",
    };
  }

  return resolved;
}
