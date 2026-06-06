import { z } from "zod";

import { generateStructuredOutput } from "@/lib/ai/runtime";
import {
  buildOutOfSessionClassificationPrompt,
  buildOutOfSessionReplyPrompt,
} from "@/lib/learning/prompts/out-of-session";
import type { StudentInterestProfile } from "@/lib/learning/types";

const questionClassificationSchema = z.object({
  classification: z.enum(["in_scope", "borderline", "off_scope"]),
  rationale: z.string(),
});

const outOfSessionReplySchema = z.object({
  response: z.string(),
});

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4);
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
    return {
      classification: "off_scope" as const,
      rationale: "Heuristic router marked the question as unrelated to the active topic.",
    };
  }

  if (overlap >= 3) {
    return {
      classification: "in_scope" as const,
      rationale: "Heuristic router found strong overlap with the topic and learning outcomes.",
    };
  }

  if (overlap >= 1) {
    return {
      classification: "borderline" as const,
      rationale: "Heuristic router found partial overlap, but the question may drift from the core topic.",
    };
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
  classification: "in_scope" | "borderline" | "off_scope";
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
