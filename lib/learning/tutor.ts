import { z } from "zod";
import {
  buildTutorReplyPrompt,
} from "@/lib/learning/prompts/tutor-runtime";
import { generateStructuredOutput } from "@/lib/ai/runtime";
import {
  buildTutorOpeningBase,
  normalizeTutorOpening,
} from "@/lib/learning/tutor-policy";

const tutorReplySchema = z.object({
  response: z.string(),
});

export async function generateSessionOpening(params: {
  topicTitle: string;
  studyLanguage: string;
  worldConnection?: string | null;
}) {
  const baseOpening = buildTutorOpeningBase({
    topicTitle: params.topicTitle,
    worldConnection: params.worldConnection,
  });

  if (params.studyLanguage.startsWith("en")) {
    return baseOpening;
  }

  const result = await generateStructuredOutput({
    schema: tutorReplySchema,
    prompt: `Translate the following tutoring opening into ${params.studyLanguage}.

Source opening:
${baseOpening}

Rules:
- Preserve the meaning exactly.
- Keep the same structure: welcome, topic focus, optional light connection, diagnostic question.
- Do not add examples, explanations, motivations, or claims of importance.
- Do not add claims about careers, society, nature, technology, AI, or the future.
- Return only the translated opening text.`,
  });

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
