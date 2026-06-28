import { z } from "zod";

import { tutorChatModel } from "@/shared/ai/models";
import { generateStructuredOutput } from "@/shared/ai/model-generation";
import { measureTutoringStep } from "@/features/tutoring/public-server";

const tutorReplySchema = z.object({
  response: z.string(),
});

function buildSessionOpeningPrompt(input: {
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

function buildTutorReplyPrompt(input: {
  systemPrompt: string;
  userMessage: string;
}) {
  return `${input.systemPrompt}

Student message:
${input.userMessage}

Write the tutor's next reply.`;
}

function normalizeTutorOpening(opening: string) {
  return opening.replace(/\s+/g, " ").trim();
}

export async function generateSessionOpening(params: {
  lessonTitle: string;
  studyLanguage: string;
  worldConnection?: string | null;
}) {
  const result = await measureTutoringStep(
    "session:opening-generate",
    {
      lessonTitle: params.lessonTitle,
      studyLanguage: params.studyLanguage,
      worldConnection: params.worldConnection ?? null,
    },
    async () =>
      await generateStructuredOutput({
        model: tutorChatModel,
        schema: tutorReplySchema,
        temperature: 0.5,
        maxOutputTokens: 140,
        prompt: buildSessionOpeningPrompt({
          lessonTitle: params.lessonTitle,
          studyLanguage: params.studyLanguage,
          worldConnection: params.worldConnection,
        }),
      }),
  );

  return normalizeTutorOpening(result.response);
}

export async function generateTutorReply(params: {
  systemPrompt: string;
  userMessage: string;
}) {
  const result = await generateStructuredOutput({
    schema: tutorReplySchema,
    prompt: buildTutorReplyPrompt(params),
  });

  return result.response;
}
