import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  tool,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  normalizeMessages as toModelMessages,
  streamAIResponse,
} from "@/shared/ai";
import { getDynamicFewShotExamples } from "@/shared/ai/few-shot-library";
import { sanitizeUserInput } from "@/shared/ai/sanitization";
import {
  evaluateScopePolicy,
  renderStrictScopePolicyInstructions,
} from "@/shared/ai/scope-policy";
import { getDb } from "@/shared/db";
import { surveyConversations, surveys } from "@/shared/db/schema";
import {
  toPersistedUIChatMessages,
  toVisibleConversationMessages,
} from "@/shared/chat/chat-ui-messages";
import { SURVEY_COMPLETION_TAG } from "@/shared/chat/chat-ui-signals";
import type { ChatMessage } from "@/shared/chat/chat-types";
import { scheduleAnalyticsRefresh } from "@/features/surveys/server/analytics/analytics-refresh-scheduler";
import { getRespondentFinishSurveyToolDefinition } from "@/features/surveys/server/education/agent-tools";
import {
  buildConductingSystemPromptParts,
  evaluateConductingTurnState,
  persistConductingTurnTranscript,
  planConductingTurn,
  resolveActiveCoverageNode,
  resolveConductingTurnPlan,
} from "@/features/surveys/server/education/conducting-runtime";
import { getConductingRuntimeLayers } from "@/features/surveys/server/education/runtime-context";
import {
  coveragePlanSchema,
  researchBriefSchema,
  sessionStateSchema,
  type CoveragePlan,
  type ResearchBrief,
  type SessionState,
} from "@/features/surveys/server/education/types";
import { updateSessionState } from "@/features/surveys/server/education/storage";
import type {
  CanonicalRespondentTurn,
  RespondentLanguage,
} from "@/features/surveys/server/respondent-conversation";

type RespondentTurnBoundaryPayloadInput = {
  brief: { brief: unknown };
  coveragePlan: { plan: unknown };
  sessionRow: {
    id: string;
    sessionState: unknown;
  };
  canonicalTurn: CanonicalRespondentTurn;
  language?: RespondentLanguage;
  surveyLanguage?: string | null;
};

type RespondentTurnNormalizedPayload = {
  brief: ResearchBrief;
  coveragePlan: CoveragePlan;
  session: {
    id: string;
    state: SessionState;
  };
  turn: CanonicalRespondentTurn;
  language: RespondentLanguage;
};

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

function isRespondentLanguage(value: unknown): value is RespondentLanguage {
  return (
    value === "en" ||
    value === "fr" ||
    value === "de" ||
    value === "es" ||
    value === "it"
  );
}

export function normalizeRespondentLanguage(
  requestedLanguage: RespondentLanguage | undefined,
  fallbackLanguage: string | null,
): RespondentLanguage {
  if (isRespondentLanguage(requestedLanguage)) {
    return requestedLanguage;
  }

  if (isRespondentLanguage(fallbackLanguage)) {
    return fallbackLanguage;
  }

  return "en";
}

export function normalizeRespondentTurnPayload(
  input: RespondentTurnBoundaryPayloadInput,
): RespondentTurnNormalizedPayload {
  return {
    brief: researchBriefSchema.parse(input.brief.brief),
    coveragePlan: coveragePlanSchema.parse(input.coveragePlan.plan),
    session: {
      id: input.sessionRow.id,
      state: sessionStateSchema.parse(input.sessionRow.sessionState),
    },
    turn: input.canonicalTurn,
    language: normalizeRespondentLanguage(
      input.language,
      input.surveyLanguage ?? null,
    ),
  };
}

function countScopeRedirects(messages: ChatMessage[]) {
  return messages.filter(
    (message) =>
      message.role === "assistant" &&
      /let's stay focused on|we need to stay on the current objective/i.test(
        message.content,
      ),
  ).length;
}

function sanitizeRespondentMessages(messages: readonly UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role === "user") {
      return {
        ...message,
        parts: message.parts?.map((part) =>
          part.type === "text"
            ? {
                ...part,
                text: sanitizeUserInput(part.text, {
                  maxLength: 2000,
                  allowNewlines: true,
                }),
              }
            : part,
        ),
      };
    }
    return message;
  });
}

function buildRespondentSystemPrompt(params: {
  dynamicSystemPrompt: string;
  objective: string;
  activeTopic: string;
}) {
  return `${params.dynamicSystemPrompt}

${renderStrictScopePolicyInstructions({
  objective: params.objective,
  currentPhase: "live respondent interview",
  activeTopic: params.activeTopic,
  allowedDetours: [
    "brief clarification of the current question",
    "asking what a current term means",
    "answering in another supported language",
  ],
})}

Respond to the user in the language they are speaking to you in. Match the language of each user message naturally.`;
}

function createTextStreamResponse(params: {
  messageId: string;
  text: string;
}) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({
          id: params.messageId,
          type: "text-start",
        });
        writer.write({
          id: params.messageId,
          type: "text-delta",
          delta: params.text,
        });
        writer.write({
          id: params.messageId,
          type: "text-end",
        });
      },
    }),
  });
}

async function persistRespondentRedirect(params: {
  conversationId: string;
  visibleMessages: ChatMessage[];
  redirectMessage: ChatMessage;
}) {
  await getDb()
    .update(surveyConversations)
    .set({
      rawConversation: [...params.visibleMessages, params.redirectMessage],
      updatedAt: new Date(),
    })
    .where(eq(surveyConversations.id, params.conversationId));
}

async function finalizePlannedRespondentTurn(params: {
  conversationId: string;
  surveyId: string;
  userId: string;
  sessionId: string;
  assistantMessage: string;
  rationale: string;
  currentSessionState: SessionState;
  visibleMessages: ChatMessage[];
}) {
  const completionText = `${SURVEY_COMPLETION_TAG} ${params.assistantMessage.trim() || "Thank you. That gives me enough to close this interview."}`.trim();
  const completionMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: completionText,
    parts: [
      { type: "text", text: completionText },
      {
        type: "tool-result",
        toolCallId: `finish-survey-${crypto.randomUUID().slice(0, 8)}`,
        toolName: "finishSurvey",
        result: { success: true, message: "Survey marked as complete" },
      },
    ],
    timestamp: new Date().toISOString(),
  };
  const nextSessionState: SessionState = {
    ...params.currentSessionState,
    status: "completed",
    stopReason: "planned_finish_signal",
    activeWorkflowDecision: {
      activeNodeId: null,
      rationale: params.rationale,
      shouldStop: true,
    },
  };

  await updateSessionState(params.sessionId, nextSessionState);
  await getDb()
    .update(surveyConversations)
    .set({
      rawConversation: [...params.visibleMessages, completionMessage],
      completed: true,
      updatedAt: new Date(),
    })
    .where(eq(surveyConversations.id, params.conversationId));
  await scheduleAnalyticsRefresh({
    surveyId: params.surveyId,
    userId: params.userId,
  }).catch(() => {});

  return {
    nextSessionState,
    response: createTextStreamResponse({
      messageId: completionMessage.id,
      text: completionText,
    }),
  };
}

async function persistRespondentStreamResult(params: {
  conversationId: string;
  surveyId: string;
  userId: string;
  sessionId: string;
  messages: UIMessage[];
  completed: boolean;
}) {
  const persistedMessages = toVisibleConversationMessages(
    toPersistedUIChatMessages(params.messages, ["user", "assistant"]),
  );

  await getDb()
    .update(surveyConversations)
    .set({
      rawConversation: persistedMessages,
      completed: params.completed,
      updatedAt: new Date(),
    })
    .where(eq(surveyConversations.id, params.conversationId));

  if (!persistedMessages.some((message) => message.role === "user")) {
    return;
  }

  await persistConductingTurnTranscript({
    surveyId: params.surveyId,
    sessionId: params.sessionId,
    messages: persistedMessages,
  });
  await scheduleAnalyticsRefresh({
    surveyId: params.surveyId,
    userId: params.userId,
  }).catch(() => {});
}

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
  const { survey, conversation, brief, coveragePlan, session, turn, language } =
    context;
  const visibleMessages = turn.canonicalMessages;
  const latestUserMessage = turn.latestUserMessage;
  const activeNode = resolveActiveCoverageNode(session.state, coveragePlan);

  if (latestUserMessage) {
    const priorDriftCount = countScopeRedirects(turn.storedMessages);
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
        where: (profile, { and, eq }) =>
          and(eq(profile.surveyId, survey.id), eq(profile.mode, "live")),
      }),
      getDb().query.surveyConductingProfiles.findFirst({
        where: (profile, { and, eq }) =>
          and(eq(profile.surveyId, survey.id), eq(profile.mode, "sample")),
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

  const planningActiveNode = resolveActiveCoverageNode(
    currentSessionState,
    coveragePlan,
  );
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

  const sanitizedMessages = sanitizeRespondentMessages(turn.originalMessages);
  const modelMessages = await toModelMessages(sanitizedMessages);

  const result = streamAIResponse(modelMessages, systemPrompt, {
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
  });

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
