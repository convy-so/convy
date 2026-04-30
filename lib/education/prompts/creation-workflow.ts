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
