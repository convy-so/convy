import { z } from "zod";

import { generateStructuredOutput } from "@/lib/ai/runtime";
import {
  buildOutOfSessionClassificationPrompt,
  buildOutOfSessionReplyPrompt,
} from "@/lib/learning/prompts/out-of-session";

const questionClassificationSchema = z.object({
  classification: z.enum(["in_scope", "borderline", "off_scope"]),
  rationale: z.string(),
});

const outOfSessionReplySchema = z.object({
  response: z.string(),
});

export async function classifyOutOfSessionQuestion(params: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  question: string;
}) {
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
  studentProfile: Record<string, unknown>;
  question: string;
  retrievedContext: string[];
  language: string;
}) {
  const result = await generateStructuredOutput({
    schema: outOfSessionReplySchema,
    prompt: buildOutOfSessionReplyPrompt(params),
  });

  return result.response;
}
