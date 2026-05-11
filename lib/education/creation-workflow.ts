import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import type { ChatMessage } from "@/lib/chat-types";

import {
  buildCoveragePlan,
  extractBrief,
  classifyProgram,
  validateBrief,
} from "./creation-workflow/brief-extraction";
import {
  planCompletionResponse,
  planNextQuestion,
} from "./creation-workflow/response-planning";
import { replaceCoveragePlan, upsertResearchBrief } from "./storage";

export {
  buildCoveragePlan,
  validateBrief,
} from "./creation-workflow/brief-extraction";
export { persistCreationConversation } from "./creation-workflow/conversation-storage";

async function buildWorkflowDraft(
  surveyId: string,
  messages: ChatMessage[],
): Promise<{
  brief: Awaited<ReturnType<typeof extractBrief>>;
  validation: ReturnType<typeof validateBrief>;
  coveragePlan: ReturnType<typeof buildCoveragePlan>;
}> {
  const routing = await classifyProgram(messages);
  const brief = await extractBrief(routing.programId, messages);

  brief.routingConfidence = routing.confidence;
  brief.routingRationale = routing.rationale;

  const validation = validateBrief(brief, routing.programId);
  brief.missingFields = validation.missingFields;
  brief.readyForSampling = validation.isReady;

  return {
    brief,
    validation,
    coveragePlan: buildCoveragePlan(surveyId, brief),
  };
}

export async function runCreationWorkflow(input: {
  surveyId: string;
  messages: ChatMessage[];
  userId?: string;
}) {
  const { brief, validation, coveragePlan } = await buildWorkflowDraft(
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

  const responseText = validation.isReady
    ? await planCompletionResponse(brief)
    : await planNextQuestion(brief, validation, input.messages);

  return {
    brief,
    coveragePlan,
    validation,
    responseText,
  };
}
