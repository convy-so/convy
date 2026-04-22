import { z } from "zod";

import { generateStructuredOutput } from "@/lib/ai/runtime";

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
    prompt: `Classify whether this student question is in scope for the course topic.

Topic: ${params.topicTitle}
Description: ${params.topicDescription ?? ""}
Learning outcomes:
${params.learningOutcomes.map((item) => `- ${item.title}: ${item.description}`).join("\n")}

Question:
${params.question}

Return:
- in_scope when the question is clearly about the active topic
- borderline when it is adjacent but still teachable with a brief bridge
- off_scope when it is meaningfully outside the topic`,
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
    prompt: `Answer the student's out-of-session question.

Reply in ${params.language}.
Classification: ${params.classification}
Topic: ${params.topicTitle}
Grade band: ${params.gradeBand}
Question: ${params.question}

Learning outcomes:
${JSON.stringify(params.learningOutcomes)}

Student profile:
${JSON.stringify(params.studentProfile)}

Retrieved course context:
${params.retrievedContext.map((item) => `- ${item}`).join("\n")}

Rules:
- stay inside the retrieved course context for facts
- if classification is off_scope, gently redirect back toward the current topic
- if classification is borderline, answer briefly and reconnect to the topic
- keep the explanation concise and teachable`,
  });

  return result.response;
}
