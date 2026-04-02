import { generateText } from "ai";

import { defaultModel } from "@/lib/ai";
import type { LearningTeachingPlaybook } from "@/lib/learning/pattern-types";
import {
  buildSessionOpeningPlan,
  buildTutorGroundingRules,
  getGradeLanguagePolicy,
  shouldUseWebOpening,
} from "@/lib/learning/runtime";
import type { GradeBand, LearningOutcomeDefinition, StudentInterestProfile } from "@/lib/learning/types";

async function searchOpeningExample(query: string) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 3,
    }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    results?: Array<{ title?: string; content?: string; url?: string }>;
  };
  return payload.results?.[0] ?? null;
}

export async function generateSessionOpening(params: {
  topicTitle: string;
  topicDescription?: string | null;
  subject?: string | null;
  studentProfile: StudentInterestProfile;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  learningOutcomes: LearningOutcomeDefinition[];
}) {
  const plan = buildSessionOpeningPlan({
    subject: params.subject,
    topicTitle: params.topicTitle,
    topicDescription: params.topicDescription,
    studentProfile: params.studentProfile,
  });

  let externalHook: string | null = null;
  if (shouldUseWebOpening(params) && plan.suggestedSearchQueries.length > 0) {
    const result = await searchOpeningExample(plan.suggestedSearchQueries[0]!);
    if (result) {
      externalHook = `${result.title ?? "Recent example"}: ${result.content ?? ""}`.trim();
    }
  }

  const text = await generateText({
    model: defaultModel,
    prompt: `Write a session opening in no more than four sentences.

Topic: ${params.topicTitle}
Description: ${params.topicDescription ?? ""}
Student profile: ${JSON.stringify(params.studentProfile)}
Teaching playbook: ${JSON.stringify(params.teachingPlaybook ?? null)}
Learning outcomes: ${params.learningOutcomes.map((outcome) => outcome.title).join(", ")}
Opening strategy: ${plan.strategy}
Personalization frame: ${plan.personalizationFrame}
External hook: ${externalHook ?? "none"}

Rules:
- sentence 1 = hook
- sentence 2 = human angle shaped by the student's interests
- sentence 3 = bridge into the concept
- sentence 4 = invitation into the session
- let the teaching playbook influence framing strength based on its confidence
- avoid examples or analogies already present in usedExampleReferences
- do not start by naming the concept in a school-like way
- do not exceed four sentences`,
  });

  return {
    opening: text.text.trim(),
    plan,
  };
}

export async function generateTutorReply(params: {
  gradeBand: GradeBand;
  topicTitle: string;
  learningOutcomes: LearningOutcomeDefinition[];
  studentProfile: StudentInterestProfile;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  retrievedContext: string[];
  transcript: Array<{ role: string; content: string }>;
}) {
  const grounding = buildTutorGroundingRules({
    gradeBand: params.gradeBand,
    topicTitle: params.topicTitle,
    learningOutcomes: params.learningOutcomes.map((outcome) => outcome.title),
    studentProfile: params.studentProfile,
  });
  const policy = getGradeLanguagePolicy(params.gradeBand);
  const transcript = params.transcript
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n");
  const context = params.retrievedContext.join("\n\n---\n\n");

  const result = await generateText({
    model: defaultModel,
    prompt: `You are a personalized tutor.

Topic: ${params.topicTitle}
Learning outcomes:
${params.learningOutcomes.map((outcome, index) => `${index + 1}. ${outcome.title}: ${outcome.description}`).join("\n")}

Language policy:
${JSON.stringify(policy)}

Student profile:
${JSON.stringify(params.studentProfile)}
Teaching playbook:
${JSON.stringify(params.teachingPlaybook ?? null)}

Grounding rules:
${grounding.systemRules.map((rule) => `- ${rule}`).join("\n")}

Retrieved teacher-approved context:
${context}

Conversation:
${transcript}

Instructions:
- Answer using the retrieved context for factual claims.
- If the answer is not supported by the material, say so clearly and stay within the material.
- Personalize explanations using the student's context tags and interests.
- Let the teaching playbook shape explanation order, encouragement, and framing when confidence is high.
- Offer quizzes or checks when helpful.
- Keep the tone age-appropriate for ${params.gradeBand}.`,
  });

  return result.text.trim();
}
