import { stepCountIs, tool } from "ai";
import { z } from "zod";
import { getDb } from "@/shared/db";
import { surveyConversations, surveys } from "@/shared/db/schema";
import {
  normalizeMessages as toModelMessages,
  streamAIResponse,
} from "@/shared/ai";
import {
  buildConductingSystemPromptParts,
  evaluateConductingTurnState,
  planConductingTurn,
  resolveActiveCoverageNode,
  resolveConductingTurnPlan,
} from "@/features/surveys/server/education/conducting-runtime";
import {
  getRespondentFinishSurveyToolDefinition,
} from "@/features/surveys/server/education/agent-tools";
import { getConductingRuntimeLayers } from "@/features/surveys/server/education/runtime-context";
import {
  updateSessionState,
} from "@/features/surveys/server/education/storage";
import { evaluateScopePolicy } from "@/shared/ai/scope-policy";
import { getDynamicFewShotExamples } from "@/shared/ai/few-shot-library";
import type { ChatMessage } from "@/shared/chat/chat-types";
import type {
  CanonicalRespondentTurn,
  RespondentLanguage,
} from "@/features/surveys/server/respondent-conversation";
import type { CoveragePlan, ResearchBrief, SessionState } from "@/features/surveys/server/education/types";
import {
  buildRespondentSystemPrompt,
  countScopeRedirects,
  sanitizeRespondentMessages,
} from "./respondent-runtime-helpers";
import {
  createTextStreamResponse,
  finalizePlannedRespondentTurn,
  persistRespondentRedirect,
  persistRespondentStreamResult,
} from "./respondent-runtime-stream";
import {
  normalizeRespondentTurnPayload,
  type RespondentTurnBoundaryPayloadInput,
} from "./respondent-runtime-models";

type RespondentTurnBoundaryInput = RespondentTurnBoundaryPayloadInput & {
  survey: typeof surveys.$inferSelect;
  conversation: typeof surveyConversations.$inferSelect;
};

export type RespondentTurnContext = {
  survey: typeof surveys.$inferSelect;
  conversation: typeof surveyConversations.$inferSelect;
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  session: {
    id: string;
    state: SessionState;
  };
  turn: CanonicalRespondentTurn;
  language: RespondentLanguage;
};

export function normalizeRespondentTurnContext(
  input: RespondentTurnBoundaryInput,
): RespondentTurnContext {
  return {
    survey: input.survey,
    conversation: input.conversation,
    ...normalizeRespondentTurnPayload(input),
  };
}

export async function processRespondentTurn(params: RespondentTurnBoundaryInput) {
  const context = normalizeRespondentTurnContext(params);
  const {
    survey,
    conversation,
    brief,
    coveragePlan,
    session,
    turn,
    language,
  } = context;
  const visibleMessages = turn.canonicalMessages;
  const latestUserMessage = turn.latestUserMessage;
  const activeNode = resolveActiveCoverageNode(session.state, coveragePlan);

  if (latestUserMessage) {
    const priorDriftCount = countScopeRedirects(
      turn.storedMessages,
    );
    const scopeDecision = await evaluateScopePolicy({
      feature: "survey_conducting",
      objective: survey.coreObjective || survey.title,
      currentPhase: "live respondent interview",
      activeTopic: activeNode?.label ?? survey.title,
      latestUserMessage,
      strictMode: true,
      driftCount: priorDriftCount,
      allowedDetours: [
        "brief clarification of the current question",
        "asking what a current term means",
        "answering in another supported language",
      ],
    });

    if (scopeDecision.shouldRedirect) {
      const redirectText = scopeDecision.redirectMessage;
      const redirectMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: redirectText,
        parts: [{ type: "text", text: redirectText }],
        timestamp: new Date().toISOString(),
      };
      await persistRespondentRedirect({
        conversationId: conversation.id,
        visibleMessages,
        redirectMessage,
      });
      return createTextStreamResponse({
        messageId: redirectMessage.id,
        text: redirectText,
      });
    }
  }

  const [activeLiveProfile, sampleFallbackProfile, runtimeLayers] =
    await Promise.all([
      getDb().query.surveyConductingProfiles.findFirst({
        where: (p, { and, eq }) => and(eq(p.surveyId, survey.id), eq(p.mode, "live")),
      }),
      getDb().query.surveyConductingProfiles.findFirst({
        where: (p, { and, eq }) => and(eq(p.surveyId, survey.id), eq(p.mode, "sample")),
      }),
      getConductingRuntimeLayers({
        surveyId: survey.id,
        classroomId: survey.classroomId,
        programId: survey.programId,
        language,
        mode: "live",
      }),
    ]);
  let currentSessionState = session.state;
  let completedByTool = false;

  if (latestUserMessage) {
    const { nextState } = await evaluateConductingTurnState({
      surveyId: survey.id,
      sessionId: session.id,
      brief,
      coveragePlan,
      sessionState: currentSessionState,
      messages: visibleMessages,
    });
    currentSessionState = nextState;
  }

  const planningActiveNode = resolveActiveCoverageNode(currentSessionState, coveragePlan);
  const rawTurnPlan = await planConductingTurn({
    surveyId: survey.id,
    brief,
    coveragePlan,
    sessionState: currentSessionState,
    messages: visibleMessages,
  });
  const turnPlan = resolveConductingTurnPlan({
    coveragePlan,
    sessionState: currentSessionState,
    messages: visibleMessages,
    plan: rawTurnPlan,
  });
  const plannedActiveNode =
    turnPlan?.action === "advance_to_node" && turnPlan.targetNodeId
      ? coveragePlan.nodes.find((node) => node.id === turnPlan.targetNodeId) ??
        planningActiveNode
      : planningActiveNode;
  const promptSessionState =
    turnPlan?.action === "advance_to_node" && turnPlan.targetNodeId
      ? {
          ...currentSessionState,
          currentNodeId: turnPlan.targetNodeId,
        }
      : currentSessionState;

  if (turnPlan?.action === "close") {
    const completionResult = await finalizePlannedRespondentTurn({
      conversationId: conversation.id,
      surveyId: survey.id,
      userId: survey.userId,
      sessionId: session.id,
      assistantMessage: turnPlan.assistantMessage,
      rationale: turnPlan.reason,
      currentSessionState,
      visibleMessages,
    });
    currentSessionState = completionResult.nextSessionState;
    return completionResult.response;
  }

  const fewShotExamples = await getDynamicFewShotExamples({
    feature: "survey_conducting",
    limit: 3,
    context: [survey.title, plannedActiveNode?.label, latestUserMessage]
      .filter(Boolean)
      .join(" | "),
  });

  const promptParts = buildConductingSystemPromptParts({
    brief,
    coveragePlan,
    sessionState: promptSessionState,
    sessionType: "live",
    turnPlan,
    conductingProfile:
      activeLiveProfile?.profile ?? sampleFallbackProfile?.profile ?? null,
    expertGuidanceContext: runtimeLayers.expertGuidanceContext,
    toolContext: {
      canFinishSurvey: true,
      canShowMedia: false,
    },
  });

  const systemPrompt = buildRespondentSystemPrompt({
    dynamicSystemPrompt: promptParts.dynamicSystemPrompt,
    objective: survey.coreObjective || survey.title,
    activeTopic: plannedActiveNode?.label ?? survey.title,
  });

  const tools = {
    finishSurvey: tool({
      description: getRespondentFinishSurveyToolDefinition().description,
      inputSchema: z.object({}),
      execute: async () => {
        const threshold = coveragePlan.completionRule.minimumRequiredNodeCoverage;
        if (
          currentSessionState.status !== "completed" &&
          currentSessionState.overallCoverage < threshold
        ) {
          return {
            error: "Interview coverage is not high enough to finish yet",
            currentCoverage: currentSessionState.overallCoverage,
            requiredCoverage: threshold,
          };
        }

        if (currentSessionState.status !== "completed") {
          currentSessionState = {
            ...currentSessionState,
            status: "completed",
            stopReason: "agent_finish_signal",
          };
          await updateSessionState(session.id, currentSessionState);
        }

        completedByTool = true;
        return { success: true, message: "Survey marked as complete" };
      },
    }),
  };

  // Sanitize conversation history before sending to the model
  const sanitizedMessages = sanitizeRespondentMessages(turn.originalMessages);

  const modelMessages = await toModelMessages(sanitizedMessages);

  const result = streamAIResponse(
    modelMessages,
    systemPrompt,
    {
      attribution: {
        surveyId: survey.id,
        feature: "survey-respondent-interview",
      },
      maxTokens: 550,
      temperature: 0.4,
      promptCache: {
        namespace: "conducting-respond",
        staticSystemPrompt: promptParts.staticSystemPrompt,
      },
      tools,
      stopWhen: stepCountIs(5),
      dynamicExamples: fewShotExamples,
    },
  );

  return result.toUIMessageStreamResponse({
    originalMessages: turn.originalMessages,
    onFinish: async ({ messages }) => {
      await persistRespondentStreamResult({
        conversationId: conversation.id,
        surveyId: survey.id,
        userId: survey.userId,
        sessionId: session.id,
        messages,
        completed:
          completedByTool || currentSessionState.status === "completed",
      });
    },
  });
}
