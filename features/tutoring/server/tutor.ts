import { z } from "zod";
import {
  buildSessionOpeningPrompt,
  buildTutorReplyPrompt,
} from "@/features/tutoring/server/prompts/tutor-runtime";
import { generateStructuredOutput } from "@/shared/ai/model-generation";
import { normalizeTutorOpening } from "@/features/tutoring/server/tutor-policy";
import { tutorChatModel } from "@/shared/ai/models";
import { measureTutoringStep } from "@/features/tutoring/public-server";

const tutorReplySchema = z.object({
  response: z.string(),
});

export async function generateSessionOpening(params: {
  topicTitle: string;
  studyLanguage: string;
  worldConnection?: string | null;
}) {
  const result = await measureTutoringStep("session:opening-generate", {
    topicTitle: params.topicTitle,
    studyLanguage: params.studyLanguage,
    worldConnection: params.worldConnection ?? null,
  }, async () => await generateStructuredOutput({
    model: tutorChatModel,
    schema: tutorReplySchema,
    temperature: 0.5,
    maxOutputTokens: 140,
    prompt: buildSessionOpeningPrompt({
      topicTitle: params.topicTitle,
      studyLanguage: params.studyLanguage,
      worldConnection: params.worldConnection,
    }),
  }));

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
