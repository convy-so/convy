import { buildContextBundle } from "@/shared/ai/core";
import {
  renderStrictScopePolicyInstructions,
  renderUntrustedContextBlock,
} from "@/shared/ai/scope-policy";
import { getEducationProgram } from "../catalog";
import type {
  CoveragePlan,
  ResearchBrief,
  SessionState,
  SessionType,
} from "../types";
import type { SampleConductingProfile } from "../sample-feedback";

const CONDUCTING_FEW_SHOT_EXAMPLES = `<few-shot-examples>
Scenario: probe once for a missing concrete example
Interviewer: What part of the program was most useful for you?
Participant: The mentoring was really useful.
Wrong next move: In what ways was the mentoring useful? What else was useful?
Better next move: Can you tell me about one specific mentoring conversation that changed how you handled your work or study?
Why: The answer is positive but still abstract. Ask for one concrete episode, not multiple broad follow-ups.

Scenario: do not probe when the evidence is already concrete
Interviewer: Tell me about a time the course changed what you did afterwards.
Participant: After the session on giving feedback, I stopped correcting my team in public. The next week I used short one-to-one check-ins instead, and one colleague who usually shut down actually brought me two problems earlier than usual.
Wrong next move: Can you say more about a time the course changed what you did afterwards?
Better next move: Move to the next required topic, for example: What, if anything, made it hard to keep using that approach after the course?
Why: The participant already gave a specific behavior change plus consequence. Re-asking the same topic would be wasteful.

Scenario: clarify a contradiction briefly, then move on
Interviewer: How easy was the platform to use?
Participant: It was straightforward once I learned it, but honestly the first week was confusing and I almost gave up.
Wrong next move: So was it easy or difficult? Can you explain again?
Better next move: When you say the first week was confusing, what was the main part that nearly made you stop using it?
Why: There is one useful contradiction to resolve. Ask one focused clarifier, not a broad reset.

Scenario: avoid repeating the same question shape
Interviewer: What made the workshops effective for you?
Participant: The examples felt practical.
Interviewer: Can you give me a specific example?
Participant: The budgeting case study matched a real project I was doing.
Wrong next move: Can you give me another specific example?
Better next move: What was it about that budgeting case study that made it usable in your real project?
Why: The first probe already got an example. The next gap is mechanism, not another example.

Scenario: advance when another node is now the better use of time
Interviewer: What result stood out most after the training?
Participant: I started planning lessons differently, and my students were asking better questions. The only problem was that it took me longer to prepare each class.
Wrong next move: Tell me more about the better questions. Tell me more about planning lessons. Tell me more about the training result.
Better next move: You mentioned prep time increased. What specifically made the new approach harder to sustain week to week?
Why: The answer already opens a high-value barrier node. Follow the live evidence instead of squeezing the current node.

Scenario: close instead of fishing for more
Interviewer: Before we finish, is there anything critical we missed about the program?
Participant: No, I think we've covered the important parts. I'm about to head into another meeting.
Wrong next move: Just one last question: if you had to summarize your experience in one word, what would it be?
Better next move: Thank you, this was very helpful. We’ve covered what I needed, so I’ll stop here.
Why: The participant is clearly done. Do not reopen the interview with a low-value final probe.

Scenario: close when coverage is sufficient even if the participant stays polite
Interviewer: Thanks, that covers the main areas I needed to understand.
Participant: Sure.
Wrong next move: Anything else you want to add? Any final thoughts? Any other examples?
Better next move: Thank you for your time. That gives me enough to close the interview.
Why: Polite silence is not a cue to keep going. If the required coverage is met, stop cleanly.
</few-shot-examples>`;

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
  turnPlan?: {
    action: "probe_same_node" | "advance_to_node" | "close";
    targetNodeId: string | null;
    probeType: string | null;
    reason: string;
    missingEvidence: string[];
    avoidRepeating: string[];
  } | null;
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
  turnPlan?: {
    action: "probe_same_node" | "advance_to_node" | "close";
    targetNodeId: string | null;
    probeType: string | null;
    reason: string;
    missingEvidence: string[];
    avoidRepeating: string[];
  } | null;
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
  const nodeStatusLines = input.coveragePlan.nodes.map((node) => {
    const coverage = Math.min(1, input.sessionState.coverageByNode[node.id] ?? 0);
    const isComplete = input.sessionState.completedNodeIds.includes(node.id);
    return `- ${node.id}: ${(coverage * 100).toFixed(0)}% / ${(node.completionThreshold * 100).toFixed(0)}% target${isComplete ? " (complete)" : ""}`;
  });
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
- Probe only when the missing evidence would materially improve decision quality.
- If the participant already gave a concrete example for the active node, do not ask another broad version of the same question.
- Once a node reaches its completion threshold, treat it as complete unless a contradiction still needs resolving.
- If fatigue is high and required coverage is achieved, close gracefully instead of opening a new topic.
- Never repeat the same question shape twice in a row.
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
</response-rules>

${CONDUCTING_FEW_SHOT_EXAMPLES}`,
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
- Study context: ${input.brief.studyContext}
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
- Node status:
${nodeStatusLines.join("\n")}
- Conversation summary:
${input.sessionState.conversationSummary || "No rolling summary yet."}
</current-session>

${input.turnPlan
    ? `<turn-plan>
- Action: ${input.turnPlan.action}
- Target node: ${input.turnPlan.targetNodeId || "none"}
- Probe type: ${input.turnPlan.probeType || "none"}
- Why: ${input.turnPlan.reason}
- Missing evidence: ${input.turnPlan.missingEvidence.join(", ") || "none"}
- Avoid repeating: ${input.turnPlan.avoidRepeating.join(" | ") || "none"}
</turn-plan>`
    : ""}`;

  return {
    staticSystemPrompt,
    dynamicSystemPrompt,
  };
}
