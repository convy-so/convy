import { generateStructuredOutput } from "@/lib/ai/runtime";
import { z } from "zod";
import {
  buildSessionOpeningPrompt,
  buildTutorReplyPrompt,
} from "@/lib/learning/prompts/tutor-runtime";

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
    prompt: buildSessionOpeningPrompt(params),
  });

  return result.response;
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
