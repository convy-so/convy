import { nanoid } from "nanoid";

import { analysisModel, generateAIResponse } from "@/lib/ai";
import { getEducationProgram } from "./catalog";
import { recordEducationTrace } from "./tracing";
import {
  listEvidenceForSession,
  listSessionTurns,
  replaceEvidence,
  replaceSessionTurns,
  updateSessionState,
} from "./storage";
import type {
  CoveragePlan,
  EvidenceRecord,
  ResearchBrief,
  SessionState,
  SessionType,
} from "./types";
import type { SampleConductingProfile } from "./sample-feedback";

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
};

function safeJsonParse<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

export function createInitialSessionState(input: {
  surveyId: string;
  sessionId: string;
  sessionType: SessionType;
  language: "en" | "fr" | "de" | "es" | "it";
  coveragePlan: CoveragePlan;
}): SessionState {
  const firstNode = input.coveragePlan.nodes[0]?.id ?? null;
  return {
    sessionId: input.sessionId,
    surveyId: input.surveyId,
    sessionType: input.sessionType,
    status: "active",
    language: input.language,
    currentNodeId: firstNode,
    completedNodeIds: [],
    pendingNodeIds: input.coveragePlan.nodes.map((node) => node.id),
    coverageByNode: Object.fromEntries(input.coveragePlan.nodes.map((node) => [node.id, 0])),
    overallCoverage: 0,
    fatigueScore: 0,
    reliabilityScore: 0.8,
    contradictions: [],
    notes: [],
    respondentProfile: { preferences: [] },
    needsHumanReview: false,
  };
}

function chooseNextNode(state: SessionState, plan: CoveragePlan): string | null {
  const remaining = plan.nodes
    .filter((node) => !state.completedNodeIds.includes(node.id))
    .sort((a, b) => b.priority - a.priority);
  return remaining[0]?.id ?? null;
}

export function buildConductingSystemPrompt(input: {
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  sessionType: SessionType;
  conductingProfile?: SampleConductingProfile | null;
  playbookContext?: string;
  personalityContext?: string;
}) {
  const program = getEducationProgram(input.brief.programId);
  const activeNode = input.coveragePlan.nodes.find((node) => node.id === input.sessionState.currentNodeId) ?? input.coveragePlan.nodes[0];
  const completedLabels = input.coveragePlan.nodes
    .filter((node) => input.sessionState.completedNodeIds.includes(node.id))
    .map((node) => node.label);

  return `${program.conductingPrompt}

<research-brief>
- Title: ${input.brief.title}
- Goal: ${input.brief.researchGoal}
- Decision: ${input.brief.decisionToInform}
- Audience: ${input.brief.audienceDefinition}
- Learning context: ${input.brief.learningContext}
- Delivery context: ${input.brief.deliveryContext}
- Time window: ${input.brief.timeWindow}
- Required topics: ${input.brief.requiredTopics.join(", ") || "None listed"}
- Success criteria: ${input.brief.successCriteria.join(", ") || "None listed"}
</research-brief>

<coverage-plan>
${input.coveragePlan.nodes.map((node) => `- ${node.id}: ${node.label} (${node.description})`).join("\n")}
</coverage-plan>

<current-session>
- Session type: ${input.sessionType}
- Active node: ${activeNode?.id || "none"} ${activeNode?.label || ""}
- Completed nodes: ${completedLabels.join(", ") || "None"}
- Overall coverage: ${(input.sessionState.overallCoverage * 100).toFixed(0)}%
- Reliability: ${(input.sessionState.reliabilityScore * 100).toFixed(0)}%
- Fatigue: ${(input.sessionState.fatigueScore * 100).toFixed(0)}%
</current-session>

${input.playbookContext ? `<approved-playbooks>
${input.playbookContext}
</approved-playbooks>` : ""}

${input.personalityContext ? `<personality>
${input.personalityContext}
</personality>` : ""}

${input.conductingProfile ? `<approved-adjustments>
${input.conductingProfile.toneDirectives.map((item) => `- Tone: ${item}`).join("\n")}
${input.conductingProfile.questionDirectives.map((item) => `- Question style: ${item}`).join("\n")}
${input.conductingProfile.probeDirectives.map((item) => `- Probing: ${item}`).join("\n")}
${input.conductingProfile.openingDirectives.map((item) => `- Opening: ${item}`).join("\n")}
${input.conductingProfile.closingDirectives.map((item) => `- Closing: ${item}`).join("\n")}
${input.conductingProfile.coverageDirectives.map((item) => `- Coverage: ${item}`).join("\n")}
</approved-adjustments>` : ""}

<response-rules>
- Ask exactly one question at a time.
- Stay anchored to the active node unless a participant answer directly advances another required node.
- Favor concrete examples.
- If fatigue is high and required coverage is achieved, close gracefully.
- Never mention internal nodes or percentages.
</response-rules>`;
}

async function evaluateTurn(input: {
  surveyId: string;
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  messages: ChatMessage[];
}) {
  const activeNode = input.coveragePlan.nodes.find((node) => node.id === input.sessionState.currentNodeId) ?? null;
  const prompt = `You are evaluating an education research interview turn. Return JSON only.

<study>
Research goal: ${input.brief.researchGoal}
Program: ${input.brief.programId}
Current node: ${activeNode?.id || "none"} ${activeNode?.label || ""}
</study>

<coverage-nodes>
${input.coveragePlan.nodes.map((node) => `- ${node.id}: ${node.label} | threshold ${node.completionThreshold} | ${node.description}`).join("\n")}
</coverage-nodes>

<conversation>
${input.messages.map((message) => `${message.role}: ${message.content}`).join("\n\n")}
</conversation>

<rules>
- Score nodeCoverage from 0.0 to 1.0 using the evidence actually present.
- Mark a node complete only when the response materially satisfies the node description.
- Prefer behavioral-example and quote evidence when available.
- Use shouldStop only when the participant is clearly done, too fatigued, or required coverage is essentially achieved.
</rules>

<schema>
{
  "nodeCoverage": {"NODE_ID": 0.0},
  "completedNodeIds": ["NODE_ID"],
  "evidence": [{"nodeId":"NODE_ID","evidenceType":"quote|behavioral-example|barrier|risk_signal|emotional_signal","excerpt":"string","sentiment":"positive|negative|neutral|mixed","reliability":70}],
  "contradictions": ["string"],
  "fatigueScore": 0.0,
  "reliabilityScore": 0.0,
  "notes": ["string"],
  "shouldStop": false
}
</schema>`;

  const raw = await generateAIResponse(prompt, undefined, {
    model: analysisModel,
    temperature: 0.1,
    maxTokens: 1200,
    surveyId: input.surveyId,
  });

  return safeJsonParse<{
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
  }>(raw);
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
    completedNodeIds: Array.from(new Set([
      ...input.sessionState.completedNodeIds,
      ...((analysis?.completedNodeIds ?? []).filter(Boolean)),
    ])),
    fatigueScore: Math.max(0, Math.min(1, analysis?.fatigueScore ?? input.sessionState.fatigueScore)),
    reliabilityScore: Math.max(0, Math.min(1, analysis?.reliabilityScore ?? input.sessionState.reliabilityScore)),
    contradictions: Array.from(new Set([
      ...input.sessionState.contradictions,
      ...((analysis?.contradictions ?? []).filter(Boolean)),
    ])),
    notes: [...input.sessionState.notes, ...((analysis?.notes ?? []).filter(Boolean))].slice(-20),
  };

  nextState.pendingNodeIds = input.coveragePlan.nodes
    .map((node) => node.id)
    .filter((nodeId) => !nextState.completedNodeIds.includes(nodeId));
  nextState.overallCoverage = input.coveragePlan.nodes.length
    ? input.coveragePlan.nodes.reduce((sum, node) => sum + Math.min(1, nextState.coverageByNode[node.id] ?? 0), 0) / input.coveragePlan.nodes.length
    : 0;
  nextState.currentNodeId = chooseNextNode(nextState, input.coveragePlan);

  const shouldStop = Boolean(analysis?.shouldStop) || (!nextState.currentNodeId && nextState.overallCoverage >= input.coveragePlan.completionRule.minimumRequiredNodeCoverage);
  if (shouldStop) {
    nextState.status = "completed";
    nextState.stopReason = analysis?.shouldStop ? "analysis_stop_signal" : "coverage_complete";
  }

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
      reliability: Math.max(0, Math.min(100, item.reliability ?? Math.round(nextState.reliabilityScore * 100))),
      metadata: { source: "post_turn_analysis", index },
    }));
  await replaceEvidence(input.sessionId, input.surveyId, evidence);

  await recordEducationTrace({
    surveyId: input.surveyId,
    sessionId: input.sessionId,
    traceType: "conducting_turn",
    payload: {
      currentNodeId: input.sessionState.currentNodeId,
      nextNodeId: nextState.currentNodeId,
      overallCoverage: nextState.overallCoverage,
      completedNodeIds: nextState.completedNodeIds,
      evidenceCount: evidence.length,
      stopReason: nextState.stopReason ?? null,
    },
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
    .map((turn) => `${turn.role === "user" ? "Participant" : "Interviewer"}: ${turn.content}`)
    .join("\n\n");
}
