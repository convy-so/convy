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

export function buildUnifiedCreationWorkflowPrompt(input: {
  conversation: string;
  heuristicProgramId: string;
  heuristicRationale: string;
  catalog: string;
}) {
  return `You are helping a teacher define an education research study.

Program catalog:
${input.catalog}

Current best routing guess: ${input.heuristicProgramId}
Routing rationale: ${input.heuristicRationale}

Conversation:
${input.conversation}

Task:
- Extract the best current research brief from the conversation.
- Stay close to what the creator actually said.
- If something is still unclear, leave it sparse rather than inventing details.
- If the brief is incomplete, write exactly one concise next question that asks for the highest-priority missing detail.
- If the brief is complete enough for sample review, write a short confirmation that the study is ready for sample review.

Rules:
- Return JSON only.
- Ask one question at a time when the brief is incomplete.
- Keep the assistant response practical and teacher-facing.
- Do not mention internal validation, hidden state, or JSON.
- Prefer concrete, specific wording over generic wording.

Schema:
{
  "title": "string",
  "researchGoal": "string",
  "decisionToInform": "string",
  "audienceDefinition": "string",
  "audienceRelationship": "string",
  "audienceKnowledgeLevel": "string",
  "learningContext": "string",
  "deliveryContext": "string",
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
  "assistantResponse": "string"
}`;
}
