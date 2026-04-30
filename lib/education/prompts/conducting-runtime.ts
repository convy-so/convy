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
}
