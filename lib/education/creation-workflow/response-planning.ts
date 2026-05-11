import { defaultModel, generateAIResponse } from "@/lib/ai";
import { safeJsonParse } from "@/lib/ai/json";
import type { ChatMessage } from "@/lib/chat-types";

import { getEducationProgram } from "../catalog";
import type {
  BriefValidationResult,
  ResearchBrief,
} from "../types";

const FIELD_LABELS: Record<string, string> = {
  researchGoal: "the main research goal",
  decisionToInform: "the decision this study should inform",
  audienceDefinition: "who the respondents are",
  learningContext: "the learning context or program being studied",
  deliveryContext: "how the learning experience is delivered",
  timeWindow: "the time window or stage being examined",
  requiredTopics: "the key topics that must be covered",
  successCriteria: "what a useful response must reveal",
  analysisQuestions: "the downstream analysis questions",
};

function parseResponseField(value: unknown): string | undefined {
  return typeof value === "object" &&
    value !== null &&
    "response" in value &&
    typeof value.response === "string"
    ? value.response
    : undefined;
}

export async function planNextQuestion(
  brief: ResearchBrief,
  validation: BriefValidationResult,
  messages: ChatMessage[],
) {
  const program = getEducationProgram(brief.programId);
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")
      ?.content || "";
  const missingField = validation.missingFields[0];
  const systemPrompt = `${program.creationPrompt}

<task>
The brief is not complete yet.
Ask exactly one concise next question that helps fill the highest-priority missing field.
Return JSON only.
</task>

<rules>
- Ask only one question.
- Keep the question practical and easy to answer.
- Avoid repeating information the creator already provided.
- If routing confidence is weak, use the question to disambiguate program fit.
</rules>

<schema>{"response":"string"}</schema>`;
  const prompt = `<brief-state>
Missing fields: ${validation.missingFields.join(", ")}
Latest creator message: ${latestUserMessage}
Research goal: ${brief.researchGoal || "missing"}
Decision to inform: ${brief.decisionToInform || "missing"}
Audience: ${brief.audienceDefinition || "missing"}
</brief-state>`;
  const raw = await generateAIResponse(prompt, systemPrompt, {
    model: defaultModel,
    temperature: 0.3,
    maxTokens: 220,
    attribution: {
      feature: "survey-creation-next-question",
    },
    promptCache: {
      namespace: "creation-next-question",
      staticSystemPrompt: systemPrompt,
    },
  }).catch(() => "");
  const response = parseResponseField(safeJsonParse(raw));
  if (response) return response;
  return missingField
    ? `To make this study usable, what should this research help you decide about ${FIELD_LABELS[missingField] || missingField}?`
    : "What is the most important thing this education study should uncover?";
}

export async function planCompletionResponse(brief: ResearchBrief) {
  const program = getEducationProgram(brief.programId);
  const systemPrompt = `${program.creationPrompt}

<task>
The research brief is complete.
Write a short, confident update that confirms readiness for sample review and mentions the chosen program in natural language.
Return JSON only.
</task>

<rules>
- Keep it under 2 sentences.
- Sound practical, not ceremonial.
- Do not mention hidden state or internal validation.
</rules>

<schema>{"response":"string"}</schema>`;
  const prompt = `<brief-summary>
Program: ${program.manifest.displayName}
Goal: ${brief.researchGoal}
Decision: ${brief.decisionToInform}
</brief-summary>`;
  const raw = await generateAIResponse(prompt, systemPrompt, {
    model: defaultModel,
    temperature: 0.3,
    maxTokens: 180,
    attribution: {
      feature: "survey-creation-completion-response",
    },
    promptCache: {
      namespace: "creation-completion-response",
      staticSystemPrompt: systemPrompt,
    },
  }).catch(() => "");
  return (
    parseResponseField(safeJsonParse(raw)) ||
    `The research brief is now ready for sample review. I have aligned it to the ${program.manifest.displayName} program.`
  );
}
