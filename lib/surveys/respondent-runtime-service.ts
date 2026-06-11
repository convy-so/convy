import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  tool,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "@/db";
import { surveyConversations, surveys } from "@/db/schema";
import {
  normalizeMessages as toModelMessages,
  streamAIResponse,
} from "@/lib/ai";
import {
  toPersistedUIChatMessages,
  toVisibleConversationMessages,
} from "@/lib/chat-ui-messages";
import {
  buildConductingSystemPromptParts,
  evaluateConductingTurnState,
  persistConductingTurnTranscript,
  planConductingTurn,
  resolveActiveCoverageNode,
  resolveConductingTurnPlan,
} from "@/lib/education/conducting-runtime";
import {
  getRespondentFinishSurveyToolDefinition,
} from "@/lib/education/agent-tools";
import { getConductingRuntimeLayers } from "@/lib/education/runtime-context";
import {
  updateSessionState,
} from "@/lib/education/storage";
import { scheduleAnalyticsRefresh } from "@/lib/analytics-scheduler";
import { evaluateScopePolicy, renderStrictScopePolicyInstructions } from "@/lib/ai/scope-policy";
import { sanitizeUserInput } from "@/lib/ai/sanitization";
import { getDynamicFewShotExamples } from "@/lib/ai/few-shot-library";
import { SURVEY_COMPLETION_TAG } from "@/lib/chat-ui-signals";
import type { ChatMessage } from "@/lib/chat-types";
import type { RespondentLanguage } from "@/lib/respondent-conversation";

export async function processRespondentTurn(params: {
  survey: typeof surveys.$inferSelect;
  conversation: typeof surveyConversations.$inferSelect;
  brief: unknown;
  coveragePlan: unknown;
  sessionRow: unknown;
  canonicalTurn: unknown;
  language?: RespondentLanguage;
}) {
  const { survey, conversation, language } = params;
  const brief = params.brief as { brief: unknown };
  const coveragePlan = params.coveragePlan as {
    plan: {
      nodes: Array<{ id: string; label?: string }>;
      completionRule: {
        minimumRequiredNodeCoverage: number;
        minimumReliability: number;
      };
    };
  };
  const sessionRow = params.sessionRow as {
    id: string;
    sessionState: {
      status: string;
      overallCoverage: number;
      stopReason?: string;
      [key: string]: unknown;
    };
  };
  const canonicalTurn = params.canonicalTurn as {
    canonicalMessages: ChatMessage[];
    latestUserMessage: string;
    storedMessages: ChatMessage[];
    originalMessages: unknown[];
  };
  const visibleMessages = canonicalTurn.canonicalMessages;
  const latestUserMessage = canonicalTurn.latestUserMessage;
  const activeNode = resolveActiveCoverageNode(
    sessionRow.sessionState as unknown as Parameters<typeof resolveActiveCoverageNode>[0],
    coveragePlan.plan as Parameters<typeof resolveActiveCoverageNode>[1],
  );

  if (latestUserMessage) {
    const priorDriftCount = (canonicalTurn.storedMessages as ChatMessage[]).filter(
      (message) =>
        message.role === "assistant" &&
        /let's stay focused on|we need to stay on the current objective/i.test(
          message.content,
        ),
    ).length;
    
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
        id: nanoid(),
        role: "assistant",
        content: redirectText,
        parts: [{ type: "text", text: redirectText }],
        timestamp: new Date().toISOString(),
      };
      const redirectedMessages = [...visibleMessages, redirectMessage];



      await getDb()
        .update(surveyConversations)
        .set({
          rawConversation: redirectedMessages,
          updatedAt: new Date(),
        })
        .where(eq(surveyConversations.id, conversation.id));

      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: async ({ writer }) => {
            writer.write({
              id: redirectMessage.id,
              type: "text-start",
            });
            writer.write({
              id: redirectMessage.id,
              type: "text-delta",
              delta: redirectText,
            });
            writer.write({
              id: redirectMessage.id,
              type: "text-end",
            });
          },
        }),
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
        language: language || (survey.language) || "en",
        mode: "live",
      }),
    ]);
  let currentSessionState = sessionRow.sessionState;
  let completedByTool = false;

  if (latestUserMessage) {
    const { nextState } = await evaluateConductingTurnState({
      surveyId: survey.id,
      sessionId: sessionRow.id,
      brief: brief.brief as Parameters<typeof evaluateConductingTurnState>[0]["brief"],
      coveragePlan: coveragePlan.plan as Parameters<
        typeof evaluateConductingTurnState
      >[0]["coveragePlan"],
      sessionState: currentSessionState as Parameters<
        typeof evaluateConductingTurnState
      >[0]["sessionState"],
      messages: visibleMessages,
    });
    currentSessionState = nextState;
  }

  const planningActiveNode = resolveActiveCoverageNode(
    currentSessionState as unknown as Parameters<typeof resolveActiveCoverageNode>[0],
    coveragePlan.plan as Parameters<typeof resolveActiveCoverageNode>[1],
  );
  const rawTurnPlan = await planConductingTurn({
    surveyId: survey.id,
    brief: brief.brief as Parameters<typeof planConductingTurn>[0]["brief"],
    coveragePlan: coveragePlan.plan as Parameters<
      typeof planConductingTurn
    >[0]["coveragePlan"],
    sessionState: currentSessionState as Parameters<
      typeof planConductingTurn
    >[0]["sessionState"],
    messages: visibleMessages,
  });
  const turnPlan = resolveConductingTurnPlan({
    coveragePlan: coveragePlan.plan as Parameters<
      typeof resolveConductingTurnPlan
    >[0]["coveragePlan"],
    sessionState: currentSessionState as Parameters<
      typeof resolveConductingTurnPlan
    >[0]["sessionState"],
    messages: visibleMessages,
    plan: rawTurnPlan,
  });
  const plannedActiveNode =
    turnPlan?.action === "advance_to_node" && turnPlan.targetNodeId
      ? (coveragePlan.plan as Parameters<typeof resolveActiveCoverageNode>[1]).nodes.find(
          (node) => node.id === turnPlan.targetNodeId,
        ) ?? planningActiveNode
      : planningActiveNode;
  const promptSessionState =
    turnPlan?.action === "advance_to_node" && turnPlan.targetNodeId
      ? {
          ...currentSessionState,
          currentNodeId: turnPlan.targetNodeId,
        }
      : currentSessionState;

  if (turnPlan?.action === "close") {
    const completionText = `${SURVEY_COMPLETION_TAG} ${turnPlan.assistantMessage.trim() || "Thank you. That gives me enough to close this interview."}`.trim();
    const completionMessage: ChatMessage = {
      id: nanoid(),
      role: "assistant",
      content: completionText,
      parts: [
        { type: "text", text: completionText },
        {
          type: "tool-result",
          toolCallId: `finish-survey-${nanoid(8)}`,
          toolName: "finishSurvey",
          result: { success: true, message: "Survey marked as complete" },
        },
      ],
      timestamp: new Date().toISOString(),
    };
    currentSessionState = {
      ...(currentSessionState as Parameters<typeof updateSessionState>[1]),
      status: "completed",
      stopReason: "planned_finish_signal",
      activeWorkflowDecision: {
        activeNodeId: null,
        rationale: turnPlan.reason,
        shouldStop: true,
      },
    };
    await updateSessionState(
      sessionRow.id,
      currentSessionState as Parameters<typeof updateSessionState>[1],
    );
    await getDb()
      .update(surveyConversations)
      .set({
        rawConversation: [...visibleMessages, completionMessage],
        completed: true,
        updatedAt: new Date(),
      })
      .where(eq(surveyConversations.id, conversation.id));
    await scheduleAnalyticsRefresh({
      surveyId: survey.id,
      userId: survey.userId,
    }).catch(() => {});

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({
            id: completionMessage.id,
            type: "text-start",
          });
          writer.write({
            id: completionMessage.id,
            type: "text-delta",
            delta: completionText,
          });
          writer.write({
            id: completionMessage.id,
            type: "text-end",
          });
        },
      }),
    });
  }

  const fewShotExamples = await getDynamicFewShotExamples({
    feature: "survey_conducting",
    limit: 3,
    context: [survey.title, plannedActiveNode?.label, latestUserMessage]
      .filter(Boolean)
      .join(" | "),
  });

  const promptParts = buildConductingSystemPromptParts({
    brief: brief.brief as Parameters<typeof buildConductingSystemPromptParts>[0]["brief"],
    coveragePlan: coveragePlan.plan as Parameters<
      typeof buildConductingSystemPromptParts
    >[0]["coveragePlan"],
    sessionState: promptSessionState as Parameters<
      typeof buildConductingSystemPromptParts
    >[0]["sessionState"],
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

  const systemPrompt = `${promptParts.dynamicSystemPrompt}

${renderStrictScopePolicyInstructions({
  objective: survey.coreObjective || survey.title,
  currentPhase: "live respondent interview",
  activeTopic: plannedActiveNode?.label ?? survey.title,
  allowedDetours: [
    "brief clarification of the current question",
    "asking what a current term means",
    "answering in another supported language",
  ],
})}

Respond to the user in the language they are speaking to you in. Match the language of each user message naturally.`;

  const tools = {
    finishSurvey: tool({
      description: getRespondentFinishSurveyToolDefinition().description,
      inputSchema: z.object({}),
      execute: async () => {
        const threshold = coveragePlan.plan.completionRule.minimumRequiredNodeCoverage;
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
          await updateSessionState(
            sessionRow.id,
            currentSessionState as Parameters<typeof updateSessionState>[1],
          );
        }

        completedByTool = true;
        return { success: true, message: "Survey marked as complete" };
      },
    }),
  };

  // Sanitize conversation history before sending to the model
  const sanitizedMessages = (canonicalTurn.originalMessages as unknown as Array<Record<string, unknown>>).map((m) => {
    if (m.role === "user" && typeof m.content === "string") {
      return {
        ...m,
        content: sanitizeUserInput(m.content, {
          maxLength: 2000,
          allowNewlines: true,
        }),
      };
    }
    return m;
  });

  const modelMessages = await toModelMessages(sanitizedMessages as unknown[]);

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
    originalMessages: canonicalTurn.originalMessages as UIMessage[],
    onFinish: async ({ messages }) => {
      const persistedMessages = toVisibleConversationMessages(
        toPersistedUIChatMessages(messages, ["user", "assistant"]),
      );

      await getDb()
        .update(surveyConversations)
        .set({
          rawConversation: persistedMessages,
          completed:
            completedByTool || currentSessionState.status === "completed",
          updatedAt: new Date(),
        })
        .where(eq(surveyConversations.id, conversation.id));

      if (persistedMessages.some((message) => message.role === "user")) {
        await persistConductingTurnTranscript({
          surveyId: survey.id,
          sessionId: sessionRow.id,
          messages: persistedMessages,
        });

        await scheduleAnalyticsRefresh({
          surveyId: survey.id,
          userId: survey.userId,
        }).catch(() => {});

        await getDb()
          .update(surveyConversations)
          .set({
            completed:
              completedByTool || currentSessionState.status === "completed",
            updatedAt: new Date(),
          })
          .where(eq(surveyConversations.id, conversation.id));
      }
    },
  });
}
