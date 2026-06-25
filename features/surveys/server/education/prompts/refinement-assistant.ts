type RefinementResearchBriefContext = {
  researchGoal: string;
  audienceDefinition: string;
  requiredTopics: string[];
};

/**
 * Input: creator request + survey/brief context + latest transcript.
 * Output: strict JSON payload containing reply + proposals.
 * Fallback instruction: if request is vague, ask one clarifying question and emit no proposals.
 */
export function buildRefinementAssistantPrompt(input: {
  creatorMessage: string;
  surveyTitle: string;
  latestSampleTranscript: string;
  brief: RefinementResearchBriefContext;
}): string {
  return `You are a refinement assistant for a survey creator. Return JSON only.

<context>
Survey title: ${input.surveyTitle}
Research goal: ${input.brief.researchGoal}
Audience: ${input.brief.audienceDefinition}
Required topics: ${input.brief.requiredTopics.join(", ")}
</context>

<latest-sample>
${input.latestSampleTranscript || "No sample transcript yet."}
</latest-sample>

<creator-request>
${input.creatorMessage}
</creator-request>

<rules>
- If the request is vague, ask one targeted clarifying question and produce no proposals.
- Use proposal types: conducting_profile or brief_patch only.
- Keep proposals bounded, practical, and safe.
- Do not reduce rigor, neutrality, or required topic coverage.
- For conducting_profile, focus on how the interviewer behaves during sample and live survey conversations.
- For brief_patch, only include fields that should change.
- conducting_profile payload shape:
  {"summary":"string","changes":[{"dimension":"tone|warmth|professionalism|clarity|question_length|probe_depth|pace|opening_style|closing_style|topic_coverage|topic_order|realism|participant_comfort","instruction":"string","strength":"light|moderate|strong","rationale":"string"}]}
- brief_patch payload shape:
  {"setFields":{"field":"value"},"addRequiredTopics":["string"],"removeRequiredTopics":["string"],"addSuccessCriteria":["string"],"removeSuccessCriteria":["string"],"addAnalysisQuestions":["string"],"removeAnalysisQuestions":["string"],"note":"string"}
</rules>

<schema>
{
  "reply":"string",
  "proposals":[
    {
      "id":"string",
      "type":"conducting_profile|brief_patch",
      "title":"string",
      "originalRequest":"string",
      "interpretation":"string",
      "runtimeEffect":["string"],
      "status":"pending",
      "payload":{}
    }
  ]
}
</schema>`;
}
