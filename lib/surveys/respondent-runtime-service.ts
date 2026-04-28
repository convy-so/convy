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
import { evaluateScopePolicy, renderStrictScopePolicyInstructions } from "@/lib/ai/scope-policy";
import { sanitizeUserInput } from "@/lib/ai/sanitization";
import { getDynamicFewShotExamples } from "@/lib/ai/few-shot-library";
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
      nodes: Array<{ label?: string }>;
      completionRule: { minimumRequiredNodeCoverage: number };
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

  const [activeLiveProfile, sampleFallbackProfile, runtimeLayers, fewShotExamples] =
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
      getDynamicFewShotExamples({
        feature: "survey_conducting",
        limit: 3,
        context: [survey.title, coveragePlan.plan.nodes[0]?.label, latestUserMessage].filter(Boolean).join(" | "),
      }),
    ]);

  const promptParts = buildConductingSystemPromptParts({
    brief: brief.brief as Parameters<typeof buildConductingSystemPromptParts>[0]["brief"],
    coveragePlan: coveragePlan.plan as Parameters<
      typeof buildConductingSystemPromptParts
    >[0]["coveragePlan"],
    sessionState: sessionRow.sessionState as Parameters<
      typeof buildConductingSystemPromptParts
    >[0]["sessionState"],
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
        if (!completedByTool) {
          const { nextState } = await finalizeConductingTurn({
            surveyId: survey.id,
            sessionId: sessionRow.id,
            brief: brief.brief as Parameters<typeof finalizeConductingTurn>[0]["brief"],
            coveragePlan: coveragePlan.plan as Parameters<
              typeof finalizeConductingTurn
            >[0]["coveragePlan"],
            sessionState: currentSessionState as Parameters<
              typeof finalizeConductingTurn
            >[0]["sessionState"],
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
