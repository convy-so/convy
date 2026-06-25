import { analysisModel, generateAIResponse } from "@/shared/ai";
import { safeJsonParse } from "@/shared/ai/json-object-parser";
import type { ChatMessage } from "@/shared/chat/chat-types";

import {
  buildProgramClassificationSystemPrompt,
  buildProgramClassificationUserPrompt,
} from "@/features/surveys/server/education/prompts/creation-workflow";
import { createLogger, serializeError } from "@/shared/infra/logger";
import {
  classifyEducationProgramHeuristically,
  getEducationProgram,
  listEducationPrograms,
} from "../catalog";
import type {
  BriefValidationResult,
  CoveragePlan,
  CreationFieldQuality,
  EducationProgramId,
  ResearchBrief,
} from "../types";

const log = createLogger("creation-workflow");

const FIELD_LABELS: Record<string, string> = {
  researchGoal: "the main research goal",
  decisionToInform: "the decision this study should inform",
  audienceDefinition: "who the respondents are",
  learningContext: "the learning context or program being studied",
  studyContext:
    "the delivery or structural context of the educational experience being studied",
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

export function getBriefFieldValue(brief: ResearchBrief, field: string): unknown {
  switch (field) {
    case "researchGoal":
      return brief.researchGoal;
    case "decisionToInform":
      return brief.decisionToInform;
    case "audienceDefinition":
      return brief.audienceDefinition;
    case "learningContext":
      return brief.learningContext;
    case "studyContext":
      return brief.studyContext;
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
  const qualityByField = new Map(
    brief.creationController.fieldQuality.map((quality) => [
      quality.field,
      quality,
    ]),
  );
  const fieldQuality = program.manifest.requiredBriefFields.map((field) => {
    const value = getBriefFieldValue(brief, field);
    const modelQuality = qualityByField.get(field);
    const hasValue = hasUsableBriefValue(value);
    if (modelQuality) {
      return {
        ...modelQuality,
        status: hasValue ? modelQuality.status : "missing",
      } satisfies CreationFieldQuality;
    }
    return {
      field,
      status: hasValue ? "thin" : "missing",
      valueSummary: summarizeBriefValue(value),
      evidence: "",
      confidence: hasValue ? 0.45 : 0,
      specificity: hasValue ? 0.45 : 0,
      unresolvedIssue: hasValue
        ? `Need more specific detail for ${FIELD_LABELS[field] || field}.`
        : `Need ${FIELD_LABELS[field] || field}.`,
      lastAskedQuestion: "",
    } satisfies CreationFieldQuality;
  });
  const missingFields = fieldQuality
    .filter(
      (quality) =>
        quality.status !== "sufficient" ||
        quality.confidence < 0.6 ||
        quality.specificity < 0.6,
    )
    .map((quality) => quality.field);
  const targetField =
    brief.creationController.targetField && missingFields.includes(brief.creationController.targetField)
      ? brief.creationController.targetField
      : missingFields[0] ?? null;
  const isReady = missingFields.length === 0;
  return {
    isReady,
    missingFields,
    notes: fieldQuality
      .filter((quality) => missingFields.includes(quality.field))
      .map(
        (quality) =>
          quality.unresolvedIssue ||
          `Need a more specific answer for ${FIELD_LABELS[quality.field] || quality.field}.`,
      ),
    fieldQuality,
    targetField,
    nextAction: isReady ? "complete" : brief.creationController.action,
  };
}

function hasUsableBriefValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.some(
      (item) => typeof item === "string" && item.trim().length >= 8,
    );
  }
  return typeof value === "string" && value.trim().length >= 8;
}

function summarizeBriefValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string").join("; ");
  }
  return typeof value === "string" ? value : "";
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
