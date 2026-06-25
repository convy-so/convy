import { z } from "zod";

import { generateStructuredOutput } from "@/shared/ai/model-generation";
import {
  buildOutOfSessionClassificationPrompt,
  buildOutOfSessionReplyPrompt,
} from "@/features/tutoring/server/prompts/out-of-session";
import type { StudentInterestProfile } from "@/features/tutoring/public-server";
import {
  LEARNING_LIMITS,
  OUT_OF_SESSION_CLASSIFICATION,
  OUT_OF_SESSION_CLASSIFICATION_VALUES,
} from "@/shared/learning/constants";

const questionClassificationSchema = z.object({
  classification: z.enum(OUT_OF_SESSION_CLASSIFICATION_VALUES),
  rationale: z.string(),
});
type QuestionClassification = z.infer<typeof questionClassificationSchema>;

const outOfSessionReplySchema = z.object({
  response: z.string(),
});

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= LEARNING_LIMITS.outOfSessionTokenMinLength);
}

function buildQuestionClassification(
  classification: QuestionClassification["classification"],
  rationale: string,
): QuestionClassification {
  return { classification, rationale };
}

function classifyOutOfSessionHeuristically(params: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  question: string;
}) {
  const question = params.question.toLowerCase();
  const questionTokens = new Set(tokenize(params.question));
  const topicTokens = new Set(
    tokenize(
      [
        params.topicTitle,
        params.topicDescription ?? "",
        ...params.learningOutcomes.map((item) => `${item.title} ${item.description}`),
      ].join(" "),
    ),
  );
  const overlap = [...questionTokens].filter((token) => topicTokens.has(token)).length;

  if (
    /\bweather|movie|music|celebrity|politics|football|soccer|basketball|gaming\b/i.test(
      question,
    ) &&
    overlap === 0
  ) {
    return buildQuestionClassification(
      OUT_OF_SESSION_CLASSIFICATION.OFF_SCOPE,
      "Heuristic router marked the question as unrelated to the active topic.",
    );
  }

  if (overlap >= LEARNING_LIMITS.heuristicStrongTopicOverlapMinimum) {
    return buildQuestionClassification(
      OUT_OF_SESSION_CLASSIFICATION.IN_SCOPE,
      "Heuristic router found strong overlap with the topic and learning outcomes.",
    );
  }

  if (overlap >= LEARNING_LIMITS.heuristicTopicOverlapMinimum) {
    return buildQuestionClassification(
      OUT_OF_SESSION_CLASSIFICATION.BORDERLINE,
      "Heuristic router found partial overlap, but the question may drift from the core topic.",
    );
  }

  return null;
}

export async function classifyOutOfSessionQuestion(params: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  question: string;
}) {
  const heuristic = classifyOutOfSessionHeuristically(params);
  if (heuristic) {
    return heuristic;
  }

  return await generateStructuredOutput({
    schema: questionClassificationSchema,
    prompt: buildOutOfSessionClassificationPrompt(params),
  });
}

export async function generateOutOfSessionReply(params: {
  classification: QuestionClassification["classification"];
  topicTitle: string;
  learningOutcomes: Array<{ title: string; description: string }>;
  gradeBand: string;
  studentProfile: StudentInterestProfile | null;
  question: string;
  retrievedContext: string;
  language: string;
}) {
  const result = await generateStructuredOutput({
    schema: outOfSessionReplySchema,
    prompt: buildOutOfSessionReplyPrompt(params),
  });

  return result.response;
}
