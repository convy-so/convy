import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  tool,
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
  finalizeConductingTurn,
} from "@/lib/education/conducting-runtime";
import {
  getRespondentFinishSurveyToolDefinition,
} from "@/lib/education/agent-tools";
import { getConductingRuntimeLayers } from "@/lib/education/runtime-context";
import {
  updateSessionState,
} from "@/lib/education/storage";
import { scheduleAnalyticsRefresh } from "@/lib/analytics-scheduler";
import {
  recordAiFeedbackEvent,
} from "@/lib/ai/observability";
import { evaluateScopePolicy, renderStrictScopePolicyInstructions } from "@/lib/ai/scope-policy";
import { sanitizeUserInput } from "@/lib/ai/sanitization";
import type { ChatMessage } from "@/lib/chat-types";
import type { RespondentLanguage } from "@/lib/respondent-conversation";

export async function processRespondentTurn(params: {
  survey: typeof surveys.$inferSelect;
  conversation: typeof surveyConversations.$inferSelect;
  brief: any;
  coveragePlan: any;
  sessionRow: any;
  canonicalTurn: any;
  language?: RespondentLanguage;
}) {
  const { survey, conversation, brief, coveragePlan, sessionRow, canonicalTurn, language } = params;
  const visibleMessages = canonicalTurn.canonicalMessages;
  const latestUserMessage = canonicalTurn.latestUserMessage;

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
      activeTopic: coveragePlan.plan.nodes[0]?.label ?? survey.title,
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

      await recordAiFeedbackEvent({
        source: "scope_policy",
        feedbackType:
          scopeDecision.promptInjectionSignal === "none"
            ? "redirected"
            : "prompt_injection_detected",
        payload: {
          surveyId: survey.id,
          conversationId: conversation.id,
          classification: scopeDecision.classification,
          promptInjectionSignal: scopeDecision.promptInjectionSignal,
          reason: scopeDecision.reason,
        },
      }).catch(() => undefined);

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
              type: "text-delta",
              delta: redirectText,
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

  const promptParts = buildConductingSystemPromptParts({
    brief: brief.brief,
    coveragePlan: coveragePlan.plan,
    sessionState: sessionRow.sessionState,
    sessionType: "live",
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
  activeTopic: coveragePlan.plan.nodes[0]?.label ?? survey.title,
  allowedDetours: [
    "brief clarification of the current question",
    "asking what a current term means",
    "answering in another supported language",
  ],
})}

Respond to the user in the language they are speaking to you in. Match the language of each user message naturally.`;

  let currentSessionState = sessionRow.sessionState;
  let completedByTool = false;

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
          await updateSessionState(sessionRow.id, currentSessionState);
        }

        completedByTool = true;
        return { success: true, message: "Survey marked as complete" };
      },
    }),
  };

  // Sanitize conversation history before sending to the model
  const sanitizedMessages = (canonicalTurn.originalMessages as any[]).map((m) => {
    if (m.role === "user") {
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

  const modelMessages = await toModelMessages(sanitizedMessages);

  const result = streamAIResponse(
    modelMessages,
    systemPrompt,
    {
      surveyId: survey.id,
      maxTokens: 550,
      temperature: 0.4,
      promptCache: {
        namespace: "conducting-respond",
        staticSystemPrompt: promptParts.staticSystemPrompt,
      },
      tools,
      stopWhen: stepCountIs(5),
      observability: {
        feature: "survey_conducting",
        scenarioType: "respondent_turn",
        resourceType: "survey_session",
        resourceId: sessionRow.id,
        metadata: {
          surveyId: survey.id,
          guidanceVersionIds: runtimeLayers.expertGuidanceVersionIds,
        },
      },
    },
  );

  return result.toUIMessageStreamResponse({
    originalMessages: canonicalTurn.originalMessages,
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
        if (!completedByTool) {
          const { nextState } = await finalizeConductingTurn({
            surveyId: survey.id,
            sessionId: sessionRow.id,
            brief: brief.brief,
            coveragePlan: coveragePlan.plan,
            sessionState: currentSessionState,
            messages: persistedMessages,
          });
          currentSessionState = nextState;
        }

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
