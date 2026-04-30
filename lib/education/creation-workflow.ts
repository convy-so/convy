import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveyCreationConversations, surveys } from "@/db/schema";
import { analysisModel, defaultModel, generateAIResponse } from "@/lib/ai";
import { safeJsonParse } from "@/lib/ai/json";
import {
  buildProgramClassificationSystemPrompt,
  buildProgramClassificationUserPrompt,
} from "@/lib/education/prompts/creation-workflow";
import { nanoid } from "nanoid";
import { getEducationProgram, classifyEducationProgramHeuristically, listEducationPrograms } from "./catalog";

import { replaceCoveragePlan, upsertResearchBrief } from "./storage";
import {
  type BriefValidationResult,
  type CoveragePlan,
  type EducationProgramId,
  type ResearchBrief,
} from "./types";

import { type ChatMessage } from "@/lib/chat-types";

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

function conversationToText(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => `${message.role === "user" ? "Creator" : "Assistant"}: ${message.content}`)
    .join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}


function isEducationProgramId(value: unknown): value is EducationProgramId {
  return listEducationPrograms().some((program) => program.manifest.id === value);
}

function parseProgramClassification(value: unknown): {
  programId?: EducationProgramId;
  confidence?: number;
  rationale?: string;
} | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    programId: isEducationProgramId(value.programId) ? value.programId : undefined,
    confidence: typeof value.confidence === "number" ? value.confidence : undefined,
    rationale: typeof value.rationale === "string" ? value.rationale : undefined,
  };
}

function getBriefFieldValue(brief: ResearchBrief, field: string): unknown {
  switch (field) {
    case "researchGoal":
      return brief.researchGoal;
    case "decisionToInform":
      return brief.decisionToInform;
    case "audienceDefinition":
      return brief.audienceDefinition;
    case "learningContext":
      return brief.learningContext;
    case "deliveryContext":
      return brief.deliveryContext;
    case "timeWindow":
      return brief.timeWindow;
    case "requiredTopics":
      return brief.requiredTopics;
    case "successCriteria":
      return brief.successCriteria;
    case "analysisQuestions":
      return brief.analysisQuestions;
    default:
      return undefined;
  }
}

function parseResponseField(value: unknown): string | undefined {
  return isRecord(value) && typeof value.response === "string"
    ? value.response
    : undefined;
}

async function classifyProgram(messages: ChatMessage[]) {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  const heuristic = classifyEducationProgramHeuristically(userText);
  const catalog = listEducationPrograms()
    .map((program) => `${program.manifest.id}: ${program.manifest.description}`)
    .join("\n");
  const systemPrompt = buildProgramClassificationSystemPrompt(catalog);
  const prompt = buildProgramClassificationUserPrompt(conversationToText(messages));
  let modelText = "";
  try {
    modelText = await generateAIResponse(prompt, systemPrompt, {
      model: analysisModel,
      temperature: 0.1,
      maxTokens: 250,
      attribution: {
        feature: "survey-creation-classify-program",
      },
      promptCache: {
        namespace: "creation-classify-program",
        staticSystemPrompt: systemPrompt,
      },
    });
  } catch (error) {
    console.error("classifyProgram failed; using heuristic fallback", { error });
  }
  const parsed = parseProgramClassification(safeJsonParse(modelText));
  if (parsed?.programId) {
    return {
      programId: parsed.programId,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? heuristic.confidence)),
      rationale: parsed.rationale || heuristic.rationale,
    };
  }
  return heuristic;
}

function buildExtractionPromptParts(
  programId: EducationProgramId,
  messages: ChatMessage[],
) {
  const program = getEducationProgram(programId);
  const required = program.manifest.requiredBriefFields.join(", ");
  const systemPrompt = `${program.creationPrompt}

<task>
Extract the latest canonical research brief from the creator conversation.
Preserve only the latest best interpretation.
Return JSON only.
</task>

<program-requirements>
Required fields for this program: ${required}
</program-requirements>

  <rules>
- Infer nothing that is contradicted by the conversation.
- Prefer concrete phrasing over generic phrasing.
- If a field is still unclear, leave it sparse and add it to missingFields.
- Do not mark the brief ready inside this step.
</rules>

<schema>
{
  "title": "string",
  "researchGoal": "string",
  "decisionToInform": "string",
  "audienceDefinition": "string",
  "audienceRelationship": "string",
  "audienceKnowledgeLevel": "string",
  "learningContext": "string",
  "deliveryContext": "string",
  "timeWindow": "string",
  "requiredTopics": ["string"],
  "successCriteria": ["string"],
  "analysisQuestions": ["string"],
  "requiredQuestions": ["string"],
  "metrics": ["string"],
  "personalInfo": ["string"],
  "riskFlags": ["string"],
  "constraints": ["string"],
  "assumptions": ["string"],
  "tone": "formal|casual|playful|empathetic",
  "media": [],
  "missingFields": ["string"]
}
</schema>`;
  const prompt = `<conversation>
${conversationToText(messages)}
</conversation>`;
  return { systemPrompt, prompt };
}

export function validateBrief(brief: ResearchBrief, programId: EducationProgramId): BriefValidationResult {
  const program = getEducationProgram(programId);
  const missingFields = program.manifest.requiredBriefFields.filter((field) => {
    const value = getBriefFieldValue(brief, field);
    if (Array.isArray(value)) return value.length === 0;
    return !value || (typeof value === "string" && value.trim().length < 3);
  });
  return {
    isReady: missingFields.length === 0,
    missingFields,
    notes: missingFields.map((field) => `Need ${FIELD_LABELS[field] || field}.`),
  };
}

export function buildCoveragePlan(surveyId: string, brief: ResearchBrief): CoveragePlan {
  const program = getEducationProgram(brief.programId);
  return {
    surveyId,
    programId: brief.programId,
    version: 1,
    nodes: program.manifest.nodes.map((node) => ({
      ...node,
      isRequired: true,
    })),
    completionRule: {
      minimumRequiredNodeCoverage: 0.8,
      minimumReliability: 0.65,
    },
  };
}

async function extractBrief(
  programId: EducationProgramId,
  messages: ChatMessage[],
) {
  const promptParts = buildExtractionPromptParts(
    programId,
    messages,
  );
  const raw = await generateAIResponse(promptParts.prompt, promptParts.systemPrompt, {
    model: analysisModel,
    temperature: 0.1,
    maxTokens: 1500,
    attribution: {
      feature: "survey-creation-extract-brief",
    },
    promptCache: {
      namespace: "creation-extract-brief",
      staticSystemPrompt: promptParts.systemPrompt,
    },
  });
  const parsedCandidate = safeJsonParse(raw);
  const parsed = isRecord(parsedCandidate) ? parsedCandidate : {};

  const brief: ResearchBrief = {
    programId,
    title: String(parsed.title || "Untitled Education Study"),
    researchGoal: String(parsed.researchGoal || ""),
    decisionToInform: String(parsed.decisionToInform || ""),
    audienceDefinition: String(parsed.audienceDefinition || ""),
    audienceRelationship: parsed.audienceRelationship ? String(parsed.audienceRelationship) : undefined,
    audienceKnowledgeLevel: parsed.audienceKnowledgeLevel ? String(parsed.audienceKnowledgeLevel) : undefined,
    learningContext: String(parsed.learningContext || ""),
    deliveryContext: String(parsed.deliveryContext || ""),
    timeWindow: String(parsed.timeWindow || ""),
    requiredTopics: Array.isArray(parsed.requiredTopics) ? parsed.requiredTopics.map(String) : [],
    successCriteria: Array.isArray(parsed.successCriteria) ? parsed.successCriteria.map(String) : [],
    analysisQuestions: Array.isArray(parsed.analysisQuestions) ? parsed.analysisQuestions.map(String) : [],
    requiredQuestions: Array.isArray(parsed.requiredQuestions) ? parsed.requiredQuestions.map(String) : [],
    metrics: Array.isArray(parsed.metrics) ? parsed.metrics.map(String) : [],
    personalInfo: Array.isArray(parsed.personalInfo) ? parsed.personalInfo.map(String) : [],
    riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags.map(String) : [],
    constraints: Array.isArray(parsed.constraints) ? parsed.constraints.map(String) : [],
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map(String) : [],
    tone: parsed.tone === "formal" || parsed.tone === "playful" || parsed.tone === "empathetic" ? parsed.tone : "casual",
    media: [],
    routingConfidence: 0,
    routingRationale: "",
    missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields.map(String) : [],
    readyForSampling: false,
  };

  return brief;
}

async function planNextQuestion(
  brief: ResearchBrief,
  validation: BriefValidationResult,
  messages: ChatMessage[],
) {
  const program = getEducationProgram(brief.programId);
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
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

async function planCompletionResponse(brief: ResearchBrief) {
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
  return parseResponseField(safeJsonParse(raw)) || `The research brief is now ready for sample review. I have aligned it to the ${program.manifest.displayName} program.`;
}

export async function runCreationWorkflow(input: {
  surveyId: string;
  messages: ChatMessage[];
  userId?: string;
}) {
  const routing = await classifyProgram(input.messages);
  const brief = await extractBrief(routing.programId, input.messages);
  brief.routingConfidence = routing.confidence;
  brief.routingRationale = routing.rationale;

  const validation = validateBrief(brief, routing.programId);
  brief.missingFields = validation.missingFields;
  brief.readyForSampling = validation.isReady;

  const plan = buildCoveragePlan(input.surveyId, brief);
  await upsertResearchBrief({
    surveyId: input.surveyId,
    programId: brief.programId,
    brief,
    completenessStatus: validation.isReady ? "ready" : "draft",
    approvalState: validation.isReady ? "sample_ready" : "pending",
    missingFields: validation.missingFields,
    validationNotes: validation.notes,
  });
  await replaceCoveragePlan(input.surveyId, plan);

  await getDb()
    .update(surveys)
    .set({
      title: brief.title,
      description: brief.learningContext,
      coreObjective: brief.researchGoal,
      requiredQuestions: brief.requiredQuestions,
      metrics: brief.metrics,
      personalInfo: brief.personalInfo,
      tone: brief.tone,
      programId: brief.programId,
      updatedAt: new Date(),
    })
    .where(eq(surveys.id, input.surveyId));

  const responseText = validation.isReady
    ? await planCompletionResponse(brief)
    : await planNextQuestion(brief, validation, input.messages);

  return {
    brief,
    coveragePlan: plan,
    validation,
    responseText,
  };
}

export async function persistCreationConversation(surveyId: string, messages: ChatMessage[]) {
  const [existing] = await getDb()
    .select()
    .from(surveyCreationConversations)
    .where(eq(surveyCreationConversations.surveyId, surveyId));

  const normalizedMessages = messages.map((message) => ({
    id: message.id ?? nanoid(),
    role: message.role,
    content: message.content,
    ...(message.parts ? { parts: message.parts } : {}),
    timestamp: message.timestamp || new Date().toISOString(),
  }));

  if (existing) {
    await getDb()
      .update(surveyCreationConversations)
      .set({ messages: normalizedMessages, updatedAt: new Date() })
      .where(eq(surveyCreationConversations.id, existing.id));
    return;
  }

  await getDb().insert(surveyCreationConversations).values({
    id: nanoid(),
    surveyId,
    messages: normalizedMessages,
    status: "in_progress",
    collectedInfo: {},
    extractedData: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
