import { analysisModel, generateAIResponse } from "@/lib/ai";
import { safeJsonParse } from "@/lib/ai/json";
import type { ChatMessage } from "@/lib/chat-types";

import {
  buildProgramClassificationSystemPrompt,
  buildProgramClassificationUserPrompt,
} from "@/lib/education/prompts/creation-workflow";
import { createLogger, serializeError } from "@/lib/logger";
import {
  classifyEducationProgramHeuristically,
  getEducationProgram,
  listEducationPrograms,
} from "../catalog";
import type {
  BriefValidationResult,
  CoveragePlan,
  EducationProgramId,
  ResearchBrief,
} from "../types";

const log = createLogger("creation-workflow");

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
    .map(
      (message) =>
        `${message.role === "user" ? "Creator" : "Assistant"}: ${message.content}`,
    )
    .join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEducationProgramId(value: unknown): value is EducationProgramId {
  return listEducationPrograms().some((program) => program.manifest.id === value);
}

function parseProgramClassification(
  value: unknown,
): Partial<ClassifiedProgram> | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    programId: isEducationProgramId(value.programId)
      ? value.programId
      : undefined,
    confidence:
      typeof value.confidence === "number" ? value.confidence : undefined,
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

export type ClassifiedProgram = {
  programId: EducationProgramId;
  confidence: number;
  rationale: string;
};

export async function classifyProgram(
  messages: ChatMessage[],
): Promise<ClassifiedProgram> {
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
    log.warn(
      "classifyProgram failed; using heuristic fallback",
      serializeError(error),
    );
  }

  const parsed = parseProgramClassification(safeJsonParse(modelText));
  if (parsed?.programId) {
    return {
      programId: parsed.programId,
      confidence: Math.max(
        0,
        Math.min(1, parsed.confidence ?? heuristic.confidence),
      ),
      rationale: parsed.rationale || heuristic.rationale,
    };
  }

  return heuristic;
}

export function validateBrief(
  brief: ResearchBrief,
  programId: EducationProgramId,
): BriefValidationResult {
  const program = getEducationProgram(programId);
  const missingFields = program.manifest.requiredBriefFields.filter((field) => {
    const value = getBriefFieldValue(brief, field);
    if (Array.isArray(value)) return value.length === 0;
    return !value || (typeof value === "string" && value.trim().length < 3);
  });
  return {
    isReady: missingFields.length === 0,
    missingFields,
    notes: missingFields.map(
      (field) => `Need ${FIELD_LABELS[field] || field}.`,
    ),
  };
}

export function buildCoveragePlan(
  surveyId: string,
  brief: ResearchBrief,
): CoveragePlan {
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

export async function extractBrief(
  programId: EducationProgramId,
  messages: ChatMessage[],
): Promise<ResearchBrief> {
  const promptParts = buildExtractionPromptParts(programId, messages);
  const raw = await generateAIResponse(
    promptParts.prompt,
    promptParts.systemPrompt,
    {
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
    },
  );
  const parsedCandidate = safeJsonParse(raw);
  const parsed = isRecord(parsedCandidate) ? parsedCandidate : {};

  return {
    programId,
    title: String(parsed.title || "Untitled Education Study"),
    researchGoal: String(parsed.researchGoal || ""),
    decisionToInform: String(parsed.decisionToInform || ""),
    audienceDefinition: String(parsed.audienceDefinition || ""),
    audienceRelationship: parsed.audienceRelationship
      ? String(parsed.audienceRelationship)
      : undefined,
    audienceKnowledgeLevel: parsed.audienceKnowledgeLevel
      ? String(parsed.audienceKnowledgeLevel)
      : undefined,
    learningContext: String(parsed.learningContext || ""),
    deliveryContext: String(parsed.deliveryContext || ""),
    timeWindow: String(parsed.timeWindow || ""),
    requiredTopics: Array.isArray(parsed.requiredTopics)
      ? parsed.requiredTopics.map(String)
      : [],
    successCriteria: Array.isArray(parsed.successCriteria)
      ? parsed.successCriteria.map(String)
      : [],
    analysisQuestions: Array.isArray(parsed.analysisQuestions)
      ? parsed.analysisQuestions.map(String)
      : [],
    requiredQuestions: Array.isArray(parsed.requiredQuestions)
      ? parsed.requiredQuestions.map(String)
      : [],
    metrics: Array.isArray(parsed.metrics) ? parsed.metrics.map(String) : [],
    personalInfo: Array.isArray(parsed.personalInfo)
      ? parsed.personalInfo.map(String)
      : [],
    riskFlags: Array.isArray(parsed.riskFlags)
      ? parsed.riskFlags.map(String)
      : [],
    constraints: Array.isArray(parsed.constraints)
      ? parsed.constraints.map(String)
      : [],
    assumptions: Array.isArray(parsed.assumptions)
      ? parsed.assumptions.map(String)
      : [],
    tone:
      parsed.tone === "formal" ||
      parsed.tone === "playful" ||
      parsed.tone === "empathetic"
        ? parsed.tone
        : "casual",
    media: [],
    routingConfidence: 0,
    routingRationale: "",
    missingFields: Array.isArray(parsed.missingFields)
      ? parsed.missingFields.map(String)
      : [],
    readyForSampling: false,
  } satisfies ResearchBrief;
}
