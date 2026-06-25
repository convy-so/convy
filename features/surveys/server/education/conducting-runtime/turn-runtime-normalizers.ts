import type { CoveragePlan } from "../types";
import type {
  ConductingTurnPlan,
  TurnAnalysisResult,
} from "./turn-runtime-models";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeTurnAnalysisResult(
  value: unknown,
): TurnAnalysisResult | null {
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

export function normalizeConductingTurnPlan(
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
