import { generateText, Output } from "ai";
import { z } from "zod";

import { analysisModel, defaultModel } from "@/lib/ai";
import type {
  GradeBand,
  LearningOutcomeDefinition,
  StudentInterestProfile,
} from "@/lib/learning/types";

const relevanceSchema = z.object({
  classification: z.enum(["on_topic", "near_topic", "off_topic"]),
  rationale: z.string(),
});

export async function classifyOutOfSessionQuestion(params: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: LearningOutcomeDefinition[];
  question: string;
}) {
  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: relevanceSchema,
    }),
    prompt: `Classify whether this student question is relevant to the current topic.

Topic: ${params.topicTitle}
Description: ${params.topicDescription ?? ""}
Learning outcomes:
${params.learningOutcomes.map((outcome) => `- ${outcome.title}: ${outcome.description}`).join("\n")}

Question:
${params.question}

Rules:
- on_topic = clearly within the topic and outcomes
- near_topic = adjacent and still useful to answer briefly
- off_topic = unrelated and should be redirected`,
  });

  return output;
}

export async function generateOutOfSessionReply(params: {
  classification: "on_topic" | "near_topic" | "off_topic";
  topicTitle: string;
  learningOutcomes: LearningOutcomeDefinition[];
  gradeBand: GradeBand;
  studentProfile: StudentInterestProfile;
  question: string;
  retrievedContext: string[];
}) {
  if (params.classification === "off_topic") {
    return `That's outside the topic your teacher set right now, so I'm going to keep us inside ${params.topicTitle}. Ask me anything connected to this topic and I'll help.`;
  }

  if (params.retrievedContext.length === 0) {
    return `I want to keep this grounded in your teacher's material, and I don't have enough teacher-approved context to answer that safely yet. Ask me another question about ${params.topicTitle}, or I can help you unpack one of the ideas already covered.`;
  }

  const { text } = await generateText({
    model: defaultModel,
    prompt: `You are answering a student's out-of-session academic question.

Topic: ${params.topicTitle}
Learning outcomes:
${params.learningOutcomes.map((outcome) => `- ${outcome.title}: ${outcome.description}`).join("\n")}
Grade band: ${params.gradeBand}
Student profile: ${JSON.stringify(params.studentProfile)}
Question:
${params.question}

Retrieved teacher-approved context:
${params.retrievedContext.join("\n\n---\n\n")}

Rules:
- answer using the retrieved context for factual claims
- if the question is near_topic, answer it briefly and bring it back to the topic
- personalize framing using the student profile
- keep the tone supportive and direct
- do not invent facts beyond the material`,
  });

  return text.trim();
}
