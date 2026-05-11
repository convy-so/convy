import { nanoid } from "nanoid";

import { analysisModel, generateAIResponse } from "@/lib/ai";
import { safeJsonParse } from "@/lib/ai/json";
import { buildConductingTurnEvaluationPrompt } from "../prompts/conducting-runtime";
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

async function evaluateTurn(input: {
  surveyId: string;
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  messages: ChatMessage[];
}) {
  const activeNode =
    input.coveragePlan.nodes.find(
      (node) => node.id === input.sessionState.currentNodeId,
    ) ?? null;
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

export async function finalizeConductingTurn(input: {
  surveyId: string;
  sessionId: string;
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  messages: ChatMessage[];
}) {
  const analysis = await evaluateTurn(input);
  const nextState: SessionState = {
    ...input.sessionState,
    coverageByNode: {
      ...input.sessionState.coverageByNode,
      ...(analysis?.nodeCoverage ?? {}),
    },
    completedNodeIds: Array.from(
      new Set([
        ...input.sessionState.completedNodeIds,
        ...((analysis?.completedNodeIds ?? []).filter(Boolean)),
      ]),
    ),
    fatigueScore: Math.max(
      0,
      Math.min(1, analysis?.fatigueScore ?? input.sessionState.fatigueScore),
    ),
    reliabilityScore: Math.max(
      0,
      Math.min(
        1,
        analysis?.reliabilityScore ?? input.sessionState.reliabilityScore,
      ),
    ),
    contradictions: Array.from(
      new Set([
        ...input.sessionState.contradictions,
        ...((analysis?.contradictions ?? []).filter(Boolean)),
      ]),
    ),
    notes: [...input.sessionState.notes, ...((analysis?.notes ?? []).filter(Boolean))].slice(-20),
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

  const shouldStop =
    Boolean(analysis?.shouldStop) ||
    (!nextState.currentNodeId &&
      nextState.overallCoverage >=
        input.coveragePlan.completionRule.minimumRequiredNodeCoverage);
  if (shouldStop) {
    nextState.status = "completed";
    nextState.stopReason = analysis?.shouldStop
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
    evidenceCount: (analysis?.evidence ?? []).length,
    pendingNodeCount: nextState.pendingNodeIds.length,
  };

  await updateSessionState(input.sessionId, nextState);
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

  const evidence: EvidenceRecord[] = (analysis?.evidence ?? [])
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
          item.reliability ?? Math.round(nextState.reliabilityScore * 100),
        ),
      ),
      metadata: { source: "post_turn_analysis", index },
    }));
  await replaceEvidence(input.sessionId, input.surveyId, evidence);

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
