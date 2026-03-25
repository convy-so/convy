import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveyCreationConversations, surveys } from "@/db/schema";
import { analysisModel, defaultModel, generateAIResponse } from "@/lib/ai";
import { nanoid } from "nanoid";
import { getEducationProgram, classifyEducationProgramHeuristically, listEducationPrograms } from "./catalog";
import { recordEducationTrace } from "./tracing";
import { listEffectivePlaybooks, replaceCoveragePlan, upsertResearchBrief } from "./storage";
import {
  type BriefValidationResult,
  type CoveragePlan,
  type EducationProgramId,
  type ResearchBrief,
} from "./types";
import { renderPlaybookContext } from "./playbooks";

export type CreationMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

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

function conversationToText(messages: CreationMessage[]): string {
  return messages
    .map((message) => `${message.role === "user" ? "Creator" : "Assistant"}: ${message.content}`)
    .join("\n\n");
}

function safeJsonParse<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

async function classifyProgram(messages: CreationMessage[]) {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  const heuristic = classifyEducationProgramHeuristically(userText);
  const catalog = listEducationPrograms()
    .map((program) => `${program.manifest.id}: ${program.manifest.description}`)
    .join("\n");
  const prompt = `Classify the creator intent into one education research program. Return JSON only.
Programs:
${catalog}

Conversation:
${conversationToText(messages)}

Schema:
{"programId":"education.course_efficacy|education.learning_outcome|education.institutional_experience|education.professional_development","confidence":0.0,"rationale":"string"}`;

  const modelText = await generateAIResponse(prompt, undefined, {
    model: analysisModel,
    temperature: 0.1,
    maxTokens: 250,
  }).catch(() => "");
  const parsed = safeJsonParse<{ programId?: EducationProgramId; confidence?: number; rationale?: string }>(modelText);
  if (parsed?.programId) {
    return {
      programId: parsed.programId,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? heuristic.confidence)),
      rationale: parsed.rationale || heuristic.rationale,
    };
  }
  return heuristic;
}

function buildExtractionPrompt(
  programId: EducationProgramId,
  messages: CreationMessage[],
  playbookContext: string,
) {
  const program = getEducationProgram(programId);
  const required = program.manifest.requiredBriefFields.join(", ");
  return `${program.creationPrompt}

<task>
Extract the latest canonical research brief from the creator conversation.
Preserve only the latest best interpretation.
Return JSON only.
</task>

<program-requirements>
Required fields for this program: ${required}
</program-requirements>

${playbookContext ? `<active-playbooks>\n${playbookContext}\n</active-playbooks>\n\n` : ""}<conversation>
${conversationToText(messages)}
</conversation>

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
}

export function validateBrief(brief: ResearchBrief, programId: EducationProgramId): BriefValidationResult {
  const program = getEducationProgram(programId);
  const missingFields = program.manifest.requiredBriefFields.filter((field) => {
    const value = (brief as Record<string, unknown>)[field];
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
  messages: CreationMessage[],
  playbookContext: string,
) {
  const prompt = buildExtractionPrompt(programId, messages, playbookContext);
  const raw = await generateAIResponse(prompt, undefined, {
    model: analysisModel,
    temperature: 0.1,
    maxTokens: 1500,
  });
  const parsed = safeJsonParse<Record<string, unknown>>(raw) ?? {};

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
  messages: CreationMessage[],
  playbookContext: string,
) {
  const program = getEducationProgram(brief.programId);
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const missingField = validation.missingFields[0];
  const prompt = `${program.creationPrompt}

<task>
The brief is not complete yet.
Ask exactly one concise next question that helps fill the highest-priority missing field.
Return JSON only.
</task>

${playbookContext ? `<active-playbooks>\n${playbookContext}\n</active-playbooks>\n\n` : ""}<brief-state>
Missing fields: ${validation.missingFields.join(", ")}
Latest creator message: ${latestUserMessage}
Research goal: ${brief.researchGoal || "missing"}
Decision to inform: ${brief.decisionToInform || "missing"}
Audience: ${brief.audienceDefinition || "missing"}
</brief-state>

<rules>
- Ask only one question.
- Keep the question practical and easy to answer.
- Avoid repeating information the creator already provided.
- If routing confidence is weak, use the question to disambiguate program fit.
</rules>

<schema>{"response":"string"}</schema>`;
  const raw = await generateAIResponse(prompt, undefined, {
    model: defaultModel,
    temperature: 0.3,
    maxTokens: 220,
  }).catch(() => "");
  const parsed = safeJsonParse<{ response?: string }>(raw);
  if (parsed?.response) return parsed.response;
  return missingField
    ? `To make this study usable, what should this research help you decide about ${FIELD_LABELS[missingField] || missingField}?`
    : "What is the most important thing this education study should uncover?";
}

async function planCompletionResponse(brief: ResearchBrief, playbookContext: string) {
  const program = getEducationProgram(brief.programId);
  const prompt = `${program.creationPrompt}

<task>
The research brief is complete.
Write a short, confident update that confirms readiness for sample review and mentions the chosen program in natural language.
Return JSON only.
</task>

${playbookContext ? `<active-playbooks>\n${playbookContext}\n</active-playbooks>\n\n` : ""}<brief-summary>
Program: ${program.manifest.displayName}
Goal: ${brief.researchGoal}
Decision: ${brief.decisionToInform}
</brief-summary>

<rules>
- Keep it under 2 sentences.
- Sound practical, not ceremonial.
- Do not mention hidden state or internal validation.
</rules>

<schema>{"response":"string"}</schema>`;
  const raw = await generateAIResponse(prompt, undefined, {
    model: defaultModel,
    temperature: 0.3,
    maxTokens: 180,
  }).catch(() => "");
  return safeJsonParse<{ response?: string }>(raw)?.response || `The research brief is now ready for sample review. I have aligned it to the ${program.manifest.displayName} program.`;
}

export async function runCreationWorkflow(input: {
  surveyId: string;
  organizationId?: string | null;
  messages: CreationMessage[];
  userId?: string;
}) {
  const routing = await classifyProgram(input.messages);
  const activePlaybooks = await listEffectivePlaybooks({
    surveyId: input.surveyId,
    organizationId: input.organizationId ?? null,
    phase: "creation",
  });
  const playbookContext = renderPlaybookContext(
    activePlaybooks.map((record) => ({
      name: record.playbook.name,
      phase: record.playbook.phase,
      scope: record.playbook.scope,
      interpretation: record.activeVersion!.interpretation,
    })),
  );
  let brief = await extractBrief(routing.programId, input.messages, playbookContext);
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
    ? await planCompletionResponse(brief, playbookContext)
    : await planNextQuestion(brief, validation, input.messages, playbookContext);

  await recordEducationTrace({
    surveyId: input.surveyId,
    traceType: "creation_workflow",
    payload: {
      programId: brief.programId,
      routingConfidence: brief.routingConfidence,
      missingFields: validation.missingFields,
      readyForSampling: validation.isReady,
    },
  });

  return {
    brief,
    coveragePlan: plan,
    validation,
    responseText,
  };
}

export async function persistCreationConversation(surveyId: string, messages: CreationMessage[]) {
  const [existing] = await getDb()
    .select()
    .from(surveyCreationConversations)
    .where(eq(surveyCreationConversations.surveyId, surveyId));

  const normalizedMessages = messages.map((message) => ({
    id: message.id ?? nanoid(),
    role: message.role,
    content: message.content,
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
