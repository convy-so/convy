import { generateStructuredOutput } from "@/lib/ai/runtime";
import { z } from "zod";

const tutorReplySchema = z.object({
  response: z.string(),
});

export async function generateSessionOpening(params: {
  topicTitle: string;
  studyLanguage: string;
  worldConnection?: string | null;
}) {
  const result = await generateStructuredOutput({
    schema: tutorReplySchema,
    prompt: `Write the opening move for a tutoring session.

Reply in ${params.studyLanguage}.
Topic: ${params.topicTitle}
World connection: ${params.worldConnection ?? "none"}

Make it warm, concise, and curiosity-building.`,
  });

  return result.response;
}

export async function generateTutorReply(params: {
  systemPrompt: string;
  userMessage: string;
}) {
  const result = await generateStructuredOutput({
    schema: tutorReplySchema,
    prompt: `${params.systemPrompt}

Student message:
${params.userMessage}

Write the tutor's next reply.`,
  });

  return result.response;
}
