import type { CoveragePlan, ResearchBrief } from "@/lib/education/types";

export function buildConductingTurnEvaluationPrompt(input: {
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  messages: Array<{ role: string; content: string }>;
  activeNode: { id: string; label: string } | null;
}) {
  return `You are evaluating an education research interview turn. Return JSON only.

<study>
Research goal: ${input.brief.researchGoal}
Program: ${input.brief.programId}
Current node: ${input.activeNode?.id || "none"} ${input.activeNode?.label || ""}
</study>

<coverage-nodes>
${input.coveragePlan.nodes.map((node) => `- ${node.id}: ${node.label} | threshold ${node.completionThreshold} | ${node.description}`).join("\n")}
</coverage-nodes>

<conversation>
${input.messages.map((message) => `${message.role}: ${message.content}`).join("\n\n")}
</conversation>

<rules>
- Score nodeCoverage from 0.0 to 1.0 using the evidence actually present.
- Mark a node complete only when the response materially satisfies the node description and is at or above that node's threshold.
- Prefer behavioral-example and quote evidence when available.
- Use shouldStop only when the participant is clearly done, too fatigued, or required coverage is essentially achieved with acceptable reliability.
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
}

export function buildConductingTurnPlanPrompt(input: {
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  messages: Array<{ role: string; content: string }>;
  activeNode: { id: string; label: string } | null;
  sessionState: {
    currentNodeId: string | null;
    completedNodeIds: string[];
    coverageByNode: Record<string, number>;
    overallCoverage: number;
    fatigueScore: number;
    reliabilityScore: number;
    contradictions: string[];
    conversationSummary: string;
  };
  language: string;
}) {
  return `You are planning the next move in an education research interview. Return JSON only.

<study>
Research goal: ${input.brief.researchGoal}
Program: ${input.brief.programId}
Respond in language: ${input.language}
Active node: ${input.activeNode?.id || "none"} ${input.activeNode?.label || ""}
Minimum overall coverage: ${input.coveragePlan.completionRule.minimumRequiredNodeCoverage}
Minimum reliability: ${input.coveragePlan.completionRule.minimumReliability}
</study>

<node-status>
${input.coveragePlan.nodes
  .map((node) => {
    const coverage = Math.min(1, input.sessionState.coverageByNode[node.id] ?? 0);
    const complete = input.sessionState.completedNodeIds.includes(node.id);
    return `- ${node.id}: ${node.label} | threshold ${node.completionThreshold} | coverage ${coverage.toFixed(2)} | complete ${complete ? "yes" : "no"} | ${node.description}`;
  })
  .join("\n")}
</node-status>

<session-state>
Overall coverage: ${input.sessionState.overallCoverage.toFixed(2)}
Reliability: ${input.sessionState.reliabilityScore.toFixed(2)}
Fatigue: ${input.sessionState.fatigueScore.toFixed(2)}
Contradictions: ${input.sessionState.contradictions.join(" | ") || "none"}
Rolling summary: ${input.sessionState.conversationSummary || "none"}
</session-state>

<conversation>
${input.messages.map((message) => `${message.role}: ${message.content}`).join("\n\n")}
</conversation>

<rules>
- Choose exactly one action: probe_same_node, advance_to_node, or close.
- Choose probe_same_node only when the active node still lacks one material evidence layer.
- Choose advance_to_node when the active node is sufficiently covered or another required node is a better next step.
- Choose close when overall coverage and reliability are good enough, or when fatigue is high and remaining gaps are low-value.
- Do not ask a near-duplicate of either of the last two interviewer questions.
- Do not keep probing if the participant already gave a concrete example and consequence for the active node.
- assistantMessage must be short, natural, and participant-facing.
- If action is not close, assistantMessage must contain exactly one question.
- If action is close, assistantMessage must not ask a question and should briefly thank the participant.
</rules>

<schema>
{
  "action": "probe_same_node|advance_to_node|close",
  "targetNodeId": "NODE_ID|null",
  "probeType": "example|mechanism|barrier|confidence|comparison|clarify|confirm|null",
  "reason": "string",
  "missingEvidence": ["string"],
  "avoidRepeating": ["string"],
  "assistantMessage": "string",
  "completionReadiness": 0.0,
  "fatigueLevel": "low|medium|high"
}
</schema>`;
}
