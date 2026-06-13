export function buildCreationControllerSystemPrompt(input: {
  catalog: string;
  programPrompt?: string;
  routingConfidence: number;
}) {
  const selectedProgramContext =
    input.programPrompt && input.routingConfidence >= 0.6
      ? `\n<selected-program-context>\n${input.programPrompt}\n</selected-program-context>`
      : "";

  return `You are the survey creation controller for Convy.

Your job is to convert a creator conversation into a decision-ready education research brief.

Platform constraints:
- This conversation defines the research brief only.
- Do not ask how the survey will be shared, distributed, assigned, or collected.
- Do not ask whether the creator wants a survey, interview, focus group, or another method.
- Treat studyContext as the educational experience context being studied, not the survey delivery method.

Controller rules:
- Ask exactly one question when more input is needed.
- Prefer the highest-value missing or weak field, not the first field mechanically.
- Do not repeat a question that the creator already answered.
- A field is sufficient only when it is specific enough to generate sample conversations and later analyze results.
- Use plain language. Avoid research jargon unless the creator used it.
- When routing confidence is low, clarify the study type once without forcing a course-feedback frame.
- Mark complete only when every manifest-required field is sufficient.

Program catalog:
${input.catalog}${selectedProgramContext}`;
}

export function buildProgramClassificationSystemPrompt(catalog: string): string {
  return `Classify the creator intent into one education research program. Return JSON only.

Programs:
${catalog}

Schema:
{"programId":"education.course_efficacy|education.learning_outcome|education.institutional_experience|education.professional_development","confidence":0.0,"rationale":"string"}`;
}

export function buildProgramClassificationUserPrompt(conversation: string): string {
  return `Conversation:
${conversation}`;
}

export function buildCreationControllerPrompt(input: {
  conversation: string;
  requiredFields: string[];
  heuristicProgramId: string;
  heuristicConfidence: number;
  heuristicRationale: string;
  catalog: string;
}) {
  return `<routing>
Current best routing guess: ${input.heuristicProgramId}
Routing confidence: ${input.heuristicConfidence}
Routing rationale: ${input.heuristicRationale}
</routing>

<program-catalog>
${input.catalog}
</program-catalog>

<required-fields>
${input.requiredFields.map((field) => `- ${field}`).join("\n")}
</required-fields>

<field-quality-standard>
- missing: no usable creator evidence.
- thin: present but too broad, generic, or underspecified for survey generation.
- sufficient: concrete enough to drive sample interviews and analysis.
- conflicting: creator evidence points in incompatible directions.
</field-quality-standard>

<conversation>
${input.conversation || "No creator-provided content yet."}
</conversation>

<few-shot-controls>
If the creator says "I want student feedback", do not complete. Ask what decision the feedback should inform.
If the creator already explained who respondents are, do not ask who they are again. Move to the weakest remaining field.
If the creator gives a broad topic like "course experience", ask for concrete required topics or success criteria.
If all required fields are sufficient, action must be complete and targetField must be null.
If a field is conflicting, action should be clarify and targetField should be that field.
</few-shot-controls>

Task:
- Choose the best-fit program.
- Extract the latest canonical brief.
- Score each required field with evidence and specificity.
- Choose the next controller action.
- Produce one creator-facing response.

Return JSON only using this shape:
{
  "programId": "education.course_efficacy|education.learning_outcome|education.institutional_experience|education.professional_development",
  "title": "string",
  "researchGoal": "string",
  "decisionToInform": "string",
  "audienceDefinition": "string",
  "audienceRelationship": "string",
  "audienceKnowledgeLevel": "string",
  "learningContext": "string",
  "studyContext": "string",
  "timeWindow": "string",
  "requiredTopics": ["string"],
  "successCriteria": ["string"],
  "analysisQuestions": ["string"],
  "requiredQuestions": ["string"],
  "metrics": ["string"],
  "personalInfo": ["string"],
  "riskFlags": ["string"],
  "constraints": ["string"],
  "assumptions": ["string"],
  "tone": "formal|casual|playful|empathetic",
  "controller": {
    "action": "ask|clarify|confirm|complete",
    "targetField": "string|null",
    "readinessRationale": "string",
    "fieldQuality": [
      {
        "field": "string",
        "status": "missing|thin|sufficient|conflicting",
        "valueSummary": "string",
        "evidence": "short creator evidence excerpt or summary",
        "confidence": 0.0,
        "specificity": 0.0,
        "unresolvedIssue": "string",
        "lastAskedQuestion": "string"
      }
    ]
  },
  "response": "one concise creator-facing message"
}`;
}
