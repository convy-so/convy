import { Output, generateText } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import type { ChatMessage } from "@/lib/chat-types";
import { analysisModel } from "@/lib/ai";

import {
  buildCoveragePlan,
  extractBrief,
  validateBrief,
} from "./creation-workflow/brief-extraction";
import {
  buildProgramClassificationSystemPrompt,
  buildUnifiedCreationWorkflowPrompt,
} from "./prompts/creation-workflow";
import { replaceCoveragePlan, upsertResearchBrief } from "./storage";
import {
} from "./types";
import {
  classifyEducationProgramHeuristically,
  getEducationProgram,
  listEducationPrograms,
} from "./catalog";

export {
  buildCoveragePlan,
  validateBrief,
} from "./creation-workflow/brief-extraction";
export { persistCreationConversation } from "./creation-workflow/conversation-storage";

const unifiedCreationWorkflowSchema = z.object({
  title: z.string().default("Untitled Education Study"),
  researchGoal: z.string().default(""),
  decisionToInform: z.string().default(""),
  audienceDefinition: z.string().default(""),
  audienceRelationship: z.string().default(""),
  audienceKnowledgeLevel: z.string().default(""),
  learningContext: z.string().default(""),
  deliveryContext: z.string().default(""),
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
  tone: z.enum(["formal", "casual", "playful", "empathetic"]).default("casual"),
  assistantResponse: z.string().min(1),
});

function conversationToText(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map(
      (message) =>
        `${message.role === "user" ? "Creator" : "Assistant"}: ${message.content}`,
    )
    .join("\n\n");
}

async function buildWorkflowDraft(
  surveyId: string,
  messages: ChatMessage[],
): Promise<{
  brief: Awaited<ReturnType<typeof extractBrief>>;
  validation: ReturnType<typeof validateBrief>;
  coveragePlan: ReturnType<typeof buildCoveragePlan>;
  responseText: string;
}> {
  const heuristicRouting = classifyEducationProgramHeuristically(
    messages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n"),
  );
  const programId = heuristicRouting.programId;
  const program = getEducationProgram(programId);
  const catalog = listEducationPrograms()
    .map((item) => `${item.manifest.id}: ${item.manifest.description}`)
    .join("\n");
  const systemPrompt = `${program.creationPrompt}

${buildProgramClassificationSystemPrompt(catalog)}`;

  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: unifiedCreationWorkflowSchema,
    }),
    temperature: 0.15,
    maxOutputTokens: 1800,
    prompt: buildUnifiedCreationWorkflowPrompt({
      conversation: conversationToText(messages),
      heuristicProgramId: heuristicRouting.programId,
      heuristicRationale: heuristicRouting.rationale,
      catalog,
    }),
    system: systemPrompt,
  });

  const brief: Awaited<ReturnType<typeof extractBrief>> = {
    programId,
    title: output.title || "Untitled Education Study",
    researchGoal: output.researchGoal,
    decisionToInform: output.decisionToInform,
    audienceDefinition: output.audienceDefinition,
    audienceRelationship: output.audienceRelationship || undefined,
    audienceKnowledgeLevel: output.audienceKnowledgeLevel || undefined,
    learningContext: output.learningContext,
    deliveryContext: output.deliveryContext,
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
    routingConfidence: heuristicRouting.confidence,
    routingRationale: heuristicRouting.rationale,
    missingFields: [],
    readyForSampling: false,
  };

  const validation = validateBrief(brief, programId);
  brief.missingFields = validation.missingFields;
  brief.readyForSampling = validation.isReady;

  return {
    brief,
    validation,
    coveragePlan: buildCoveragePlan(surveyId, brief),
    responseText: output.assistantResponse,
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
