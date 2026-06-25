import { Output, generateText } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/shared/db";
import { surveys } from "@/shared/db/schema";
import { analysisModel } from "@/shared/ai";
import type { ChatMessage } from "@/shared/chat/chat-types";

import {
  buildCoveragePlan,
  classifyProgram,
  validateBrief,
} from "./creation-workflow/brief-extraction";
import {
  buildCreationControllerPrompt,
  buildCreationControllerSystemPrompt,
} from "./prompts/creation-workflow";
import { classifyEducationProgramHeuristically, getEducationProgram, listEducationPrograms } from "./catalog";
import { replaceCoveragePlan, upsertResearchBrief } from "./storage";
import {
  EDUCATION_PROGRAM_IDS,
  type CreationControllerState,
  type EducationProgramId,
  type ResearchBrief,
} from "./types";
import {
  CREATION_CONTROLLER_ACTION_VALUES,
  CREATION_FIELD_QUALITY_STATUS_VALUES,
  SURVEY_DEFAULTS,
  SURVEY_TONE_VALUES,
} from "@/shared/surveys/constants";

export {
  buildCoveragePlan,
  validateBrief,
} from "./creation-workflow/brief-extraction";
export { persistCreationConversation } from "./creation-workflow/conversation-storage";

const educationProgramIdSchema = z.enum(EDUCATION_PROGRAM_IDS);

const creationControllerOutputSchema = z.object({
  action: z.enum(CREATION_CONTROLLER_ACTION_VALUES),
  targetField: z.string().nullable(),
  readinessRationale: z.string().default(""),
  fieldQuality: z.array(
    z.object({
      field: z.string(),
      status: z.enum(CREATION_FIELD_QUALITY_STATUS_VALUES),
      valueSummary: z.string().default(""),
      evidence: z.string().default(""),
      confidence: z.number().min(0).max(1).default(0),
      specificity: z.number().min(0).max(1).default(0),
      unresolvedIssue: z.string().default(""),
      lastAskedQuestion: z.string().default(""),
    }),
  ).default([]),
});

const creationWorkflowSchema = z.object({
  programId: educationProgramIdSchema,
  title: z.string().default("Untitled Education Study"),
  researchGoal: z.string().default(""),
  decisionToInform: z.string().default(""),
  audienceDefinition: z.string().default(""),
  audienceRelationship: z.string().default(""),
  audienceKnowledgeLevel: z.string().default(""),
  learningContext: z.string().default(""),
  studyContext: z.string().default(""),
  timeWindow: z.string().default(""),
  requiredTopics: z.array(z.string()).default([]),
  successCriteria: z.array(z.string()).default([]),
  analysisQuestions: z.array(z.string()).default([]),
  requiredQuestions: z.array(z.string()).default([]),
  metrics: z.array(z.string()).default([]),
  personalInfo: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  tone: z.enum(SURVEY_TONE_VALUES).default(SURVEY_DEFAULTS.tone),
  controller: creationControllerOutputSchema,
  response: z.string().default(""),
});

function isBootstrapCreationMessage(message: ChatMessage) {
  return (
    message.role === "user" &&
    /start the conversation now\.?\s*greet the participant/i.test(
      message.content,
    )
  );
}

function creationMessages(messages: ChatMessage[]) {
  return messages.filter(
    (message) =>
      (message.role === "user" || message.role === "assistant") &&
      !isBootstrapCreationMessage(message),
  );
}

function conversationToText(messages: ChatMessage[]) {
  return creationMessages(messages)
    .map(
      (message) =>
        `${message.role === "user" ? "Creator" : "Assistant"}: ${message.content}`,
    )
    .join("\n\n");
}

function askedFieldHistory(
  messages: ChatMessage[],
  controller: CreationControllerState,
) {
  const controllerQuestions = controller.fieldQuality
    .filter((quality) => quality.lastAskedQuestion.trim())
    .map((quality) => ({
      field: quality.field,
      question: quality.lastAskedQuestion.trim(),
    }));
  const recentAssistantQuestions = creationMessages(messages)
    .filter((message) => message.role === "assistant" && message.content.includes("?"))
    .slice(-6)
    .map((message) => ({
      field: "unknown",
      question: message.content.trim(),
    }));

  return Array.from(
    new Map(
      [...controllerQuestions, ...recentAssistantQuestions].map((item) => [
        `${item.field}:${item.question.toLowerCase()}`,
        item,
      ]),
    ).values(),
  ).slice(-12);
}

function fallbackCreationResponse(params: {
  action: CreationControllerState["action"];
  targetField: string | null;
  programName: string;
}) {
  if (params.action === "complete") {
    return `The research brief is ready for sample review and aligned to ${params.programName}.`;
  }
  switch (params.targetField) {
    case "researchGoal":
      return "What should this study help you understand or improve?";
    case "decisionToInform":
      return "What decision should the results help you make?";
    case "audienceDefinition":
      return "Who should answer this survey, and what is their relationship to the learning experience?";
    case "learningContext":
      return "What learning experience, program, course, or service should this survey focus on?";
    case "studyContext":
      return "What part of that education experience should respondents think about when answering?";
    case "timeWindow":
      return "What time period or stage should respondents reflect on?";
    case "requiredTopics":
      return "What topics must the survey cover for the results to be useful?";
    case "successCriteria":
      return "What would a useful response need to reveal for you to trust the results?";
    case "analysisQuestions":
      return "What comparisons or analysis questions should the final results answer?";
    default:
      return "What is the most important detail this survey needs before we generate sample conversations?";
  }
}

async function buildWorkflowDraft(
  surveyId: string,
  messages: ChatMessage[],
): Promise<{
  brief: ResearchBrief;
  validation: ReturnType<typeof validateBrief>;
  coveragePlan: ReturnType<typeof buildCoveragePlan>;
  responseText: string;
}> {
  const conversation = conversationToText(messages);
  const userText = creationMessages(messages)
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  const heuristicRouting = classifyEducationProgramHeuristically(userText);
  const routedProgram = await classifyProgram(creationMessages(messages));
  const routedProgramId = routedProgram.programId || heuristicRouting.programId;
  const routedProgramAsset = getEducationProgram(routedProgramId);
  const catalog = listEducationPrograms()
    .map((item) => `${item.manifest.id}: ${item.manifest.description}`)
    .join("\n");
  const systemPrompt = buildCreationControllerSystemPrompt({
    catalog,
    programPrompt: routedProgramAsset.creationPrompt,
    routingConfidence: routedProgram.confidence,
  });

  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: creationWorkflowSchema,
    }),
    temperature: 0.12,
    maxOutputTokens: 2200,
    system: systemPrompt,
    prompt: buildCreationControllerPrompt({
      conversation,
      requiredFields: routedProgramAsset.manifest.requiredBriefFields,
      heuristicProgramId: routedProgramId,
      heuristicConfidence: routedProgram.confidence,
      heuristicRationale: routedProgram.rationale || heuristicRouting.rationale,
      catalog,
    }),
  });

  const programId: EducationProgramId = output.programId;
  const program = getEducationProgram(programId);
  const controller: CreationControllerState = {
    version: 1,
    action: output.controller.action,
    targetField: output.controller.targetField,
    fieldQuality: output.controller.fieldQuality,
    askedFieldHistory: [],
    readinessRationale: output.controller.readinessRationale,
  };
  controller.askedFieldHistory = askedFieldHistory(messages, controller);

  const brief: ResearchBrief = {
    programId,
    title: output.title || "Untitled Education Study",
    researchGoal: output.researchGoal,
    decisionToInform: output.decisionToInform,
    audienceDefinition: output.audienceDefinition,
    audienceRelationship: output.audienceRelationship || undefined,
    audienceKnowledgeLevel: output.audienceKnowledgeLevel || undefined,
    learningContext: output.learningContext,
    studyContext: output.studyContext,
    timeWindow: output.timeWindow,
    requiredTopics: output.requiredTopics,
    successCriteria: output.successCriteria,
    analysisQuestions: output.analysisQuestions,
    requiredQuestions: output.requiredQuestions,
    metrics: output.metrics,
    personalInfo: output.personalInfo,
    riskFlags: output.riskFlags,
    constraints: output.constraints,
    assumptions: output.assumptions,
    tone: output.tone,
    media: [],
    routingConfidence: routedProgram.confidence,
    routingRationale: routedProgram.rationale,
    missingFields: [],
    readyForSampling: false,
    creationController: controller,
  };

  const validation = validateBrief(brief, programId);
  brief.missingFields = validation.missingFields;
  brief.readyForSampling = validation.isReady;
  brief.creationController = {
    ...brief.creationController,
    action: validation.isReady ? "complete" : validation.nextAction,
    targetField: validation.isReady ? null : validation.targetField,
    fieldQuality: validation.fieldQuality,
    readinessRationale:
      validation.isReady
        ? "All manifest-required fields have sufficient evidence."
        : brief.creationController.readinessRationale,
  };

  const modelResponseIsConsistent =
    validation.isReady || output.controller.action !== "complete";
  const responseText =
    modelResponseIsConsistent && output.response.trim()
      ? output.response.trim()
      : fallbackCreationResponse({
          action: brief.creationController.action,
          targetField: brief.creationController.targetField,
          programName: program.manifest.displayName,
        });

  return {
    brief,
    validation,
    coveragePlan: buildCoveragePlan(surveyId, brief),
    responseText,
  };
}

export async function runCreationWorkflow(input: {
  surveyId: string;
  messages: ChatMessage[];
  userId?: string;
}) {
  const { brief, validation, coveragePlan, responseText } = await buildWorkflowDraft(
    input.surveyId,
    input.messages,
  );

  await upsertResearchBrief({
    surveyId: input.surveyId,
    programId: brief.programId,
    brief,
    completenessStatus: validation.isReady ? "ready" : "draft",
    approvalState: validation.isReady ? "sample_ready" : "pending",
    missingFields: validation.missingFields,
    validationNotes: validation.notes,
  });
  await replaceCoveragePlan(input.surveyId, coveragePlan);

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

  return {
    brief,
    coveragePlan,
    validation,
    responseText,
  };
}
