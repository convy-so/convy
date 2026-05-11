import { buildContextBundle } from "@/lib/ai-core";
import {
  renderStrictScopePolicyInstructions,
  renderUntrustedContextBlock,
} from "@/lib/ai/scope-policy";
import { getEducationProgram } from "../catalog";
import type {
  CoveragePlan,
  ResearchBrief,
  SessionState,
  SessionType,
} from "../types";
import type { SampleConductingProfile } from "../sample-feedback";

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
    coverageByNode: Object.fromEntries(
      input.coveragePlan.nodes.map((node) => [node.id, 0]),
    ),
    overallCoverage: 0,
    fatigueScore: 0,
    reliabilityScore: 0.8,
    contradictions: [],
    notes: [],
    respondentProfile: { preferences: [] },
    conversationSummary: "",
    summaryVersion: 0,
    activeWorkflowDecision: {
      activeNodeId: firstNode,
      rationale: "Start with the highest-priority required node.",
      shouldStop: false,
    },
    contextBudgetSnapshot: {
      summaryTokens: 0,
      evidenceCount: 0,
      pendingNodeCount: input.coveragePlan.nodes.length,
    },
    needsHumanReview: false,
  };
}

export function buildConductingSystemPrompt(input: {
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  sessionType: SessionType;
  conductingProfile?: SampleConductingProfile | null;
  expertGuidanceContext?: string;
  toolContext?: {
    canFinishSurvey?: boolean;
    canShowMedia?: boolean;
  };
}) {
  const parts = buildConductingSystemPromptParts(input);
  return parts.dynamicSystemPrompt
    ? `${parts.staticSystemPrompt}\n\n${parts.dynamicSystemPrompt}`
    : parts.staticSystemPrompt;
}

export function buildConductingSystemPromptParts(input: {
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  sessionState: SessionState;
  sessionType: SessionType;
  conductingProfile?: SampleConductingProfile | null;
  expertGuidanceContext?: string;
  toolContext?: {
    canFinishSurvey?: boolean;
    canShowMedia?: boolean;
  };
}) {
  const program = getEducationProgram(input.brief.programId);
  const activeNode =
    input.coveragePlan.nodes.find(
      (node) => node.id === input.sessionState.currentNodeId,
    ) ?? input.coveragePlan.nodes[0];
  const completedLabels = input.coveragePlan.nodes
    .filter((node) => input.sessionState.completedNodeIds.includes(node.id))
    .map((node) => node.label);
  const toolRules = [
    input.toolContext?.canFinishSurvey
      ? "- If required coverage is achieved and the interview should end, call `finishSurvey` instead of only implying the interview is over."
      : "- If required coverage is achieved and the interview should end, close clearly and naturally.",
    null,
  ]
    .filter(Boolean)
    .join("\n");
  const staticContextBundle = buildContextBundle({
    key: "survey_conducting",
    layers: [
      {
        kind: "product_policy",
        label: "Survey conducting policy",
        content: `${program.conductingPrompt}

<response-rules>
- Ask exactly one question at a time.
- Stay anchored to the active node unless a participant answer directly advances another required node.
- Favor concrete examples.
- If fatigue is high and required coverage is achieved, close gracefully.
${toolRules}
- Never mention internal nodes or percentages.
${renderStrictScopePolicyInstructions({
  objective: input.brief.researchGoal,
  currentPhase: input.sessionType,
  activeTopic: activeNode?.label ?? input.brief.title,
  allowedDetours: [
    "brief clarification of the current interview question",
    "asking what a current term means",
    "answering in another supported language",
  ],
})}
</response-rules>`,
        sourceType: "product_policy",
        sourceId: "survey_conducting",
        versionId: "v3.deep",
      },
      {
        kind: "workflow_state",
        label: "Research brief and coverage plan",
        content: `<research-brief>
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
${input.coveragePlan.nodes
  .map((node) => `- ${node.id}: ${node.label} (${node.description})`)
  .join("\n")}
</coverage-plan>`,
        sourceType: "workflow",
        sourceId: input.coveragePlan.surveyId,
        versionId: `${input.coveragePlan.version}`,
      },
      {
        kind: "expert_guidance",
        label: "Approved conducting guidance",
        content: input.expertGuidanceContext
          ? renderUntrustedContextBlock(
              "expert_guidance",
              input.expertGuidanceContext,
            )
          : "",
        sourceType: "expert_guidance",
        sourceId: input.coveragePlan.surveyId,
      },
      {
        kind: "user_overlay",
        label: "Respondent-facing adjustments",
        content: input.conductingProfile
          ? `<approved-adjustments>
${input.conductingProfile.toneDirectives.map((item) => `- Tone: ${item}`).join("\n")}
${input.conductingProfile.questionDirectives.map((item) => `- Question style: ${item}`).join("\n")}
${input.conductingProfile.probeDirectives.map((item) => `- Probing: ${item}`).join("\n")}
${input.conductingProfile.openingDirectives.map((item) => `- Opening: ${item}`).join("\n")}
${input.conductingProfile.closingDirectives.map((item) => `- Closing: ${item}`).join("\n")}
${input.conductingProfile.coverageDirectives.map((item) => `- Coverage: ${item}`).join("\n")}
</approved-adjustments>`
          : "",
        sourceType: "overlay",
        sourceId: input.coveragePlan.surveyId,
      },
    ],
  });
  const staticSystemPrompt = staticContextBundle.rendered;

  const dynamicSystemPrompt = `<current-session>
- Session type: ${input.sessionType}
- Active node: ${activeNode?.id || "none"} ${activeNode?.label || ""}
- Completed nodes: ${completedLabels.join(", ") || "None"}
- Overall coverage: ${(input.sessionState.overallCoverage * 100).toFixed(0)}%
- Reliability: ${(input.sessionState.reliabilityScore * 100).toFixed(0)}%
- Fatigue: ${(input.sessionState.fatigueScore * 100).toFixed(0)}%
- Workflow rationale: ${input.sessionState.activeWorkflowDecision.rationale || "Stay with the highest-priority open node."}
- Conversation summary:
${input.sessionState.conversationSummary || "No rolling summary yet."}
</current-session>`;

  return {
    staticSystemPrompt,
    dynamicSystemPrompt,
  };
}
