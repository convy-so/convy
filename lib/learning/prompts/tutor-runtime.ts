export function buildSessionOpeningPrompt(input: {
  topicTitle: string;
  studyLanguage: string;
  worldConnection?: string | null;
}) {
  return `Write the opening move for a tutoring session.

Reply in ${input.studyLanguage}.
Topic: ${input.topicTitle}
World connection: ${input.worldConnection ?? "none"}

Make it warm, concise, and curiosity-building.`;
}

export function buildTutorReplyPrompt(input: {
  systemPrompt: string;
  userMessage: string;
}) {
  return `${input.systemPrompt}

Student message:
${input.userMessage}

Write the tutor's next reply.`;
}
