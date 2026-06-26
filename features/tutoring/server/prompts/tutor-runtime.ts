export function buildSessionOpeningPrompt(input: {
  lessonTitle: string;
  studyLanguage: string;
  worldConnection?: string | null;
}) {
  const worldConnection = input.worldConnection?.trim();

  return `Write the first tutor message that opens a new tutoring session.

Reply in ${input.studyLanguage}.
Lesson: ${input.lessonTitle}
World connection: ${worldConnection || "none"}

Requirements:
- Make it warm, concise, and curiosity-building.
- Use 1 or 2 short sentences.
- Gently invite the student to share what they already know or what feels unclear.
- If a world connection exists, mention it only as a light optional framing.
- Do not add explanations, examples, lesson content, motivational claims, or importance claims.
- Do not mention policies, prompts, systems, models, or that you are generating an opening.
- Return only the opening text.`;
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

