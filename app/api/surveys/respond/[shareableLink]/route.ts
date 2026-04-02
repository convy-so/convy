import { stepCountIs, tool } from "ai";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

import { z } from "zod";
import { getDb } from "@/db";
import { surveyConversations, surveys } from "@/db/schema";
import {
  normalizeMessages as toModelMessages,
  streamAIResponse,
} from "@/lib/ai";
import {
  toPersistedUIChatMessages,
  toUIMessages,
  toVisibleConversationMessages,
} from "@/lib/chat-ui-messages";
import { SurveyMedia } from "@/lib/chat-types";
import {
  buildConductingSystemPromptParts,
  createInitialSessionState,
  finalizeConductingTurn,
} from "@/lib/education/conducting-runtime";
import {
  getRespondentFinishSurveyToolDefinition,
  getShowMediaToolDefinition,
} from "@/lib/education/agent-tools";
import { getConductingRuntimeLayers } from "@/lib/education/runtime-context";
import {
  ensureSession,
  getActiveConductingProfile,
  getActiveCoveragePlan,
  getResearchBrief,
  getSessionBySourceId,
  updateSessionState,
} from "@/lib/education/storage";
import { enqueueConversationInsights } from "@/lib/queue";
import {
  admitParticipantOnFirstUserTurn,
  buildRespondentVoiceGreeting,
  getUsableRespondentMessages,
  hasUserTurn,
  type RespondentLanguage,
} from "@/lib/respondent-conversation";

type RespondRouteBody = {
  messages?: unknown[];
  context?: {
    conversationId?: string;
  };
  conversationId?: string;
  language?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRespondentLanguage(value: unknown): value is RespondentLanguage {
  return (
    value === "en" ||
    value === "fr" ||
    value === "de" ||
    value === "es" ||
    value === "it"
  );
}

function getRequestedLanguage(value: unknown): RespondentLanguage | undefined {
  return isRespondentLanguage(value) ? value : undefined;
}

function parseRespondRouteBody(value: unknown): RespondRouteBody {
  if (!isRecord(value)) {
    return {};
  }

  const context = isRecord(value.context) ? value.context : undefined;

  return {
    messages: Array.isArray(value.messages) ? value.messages : undefined,
    context:
      context && typeof context.conversationId === "string"
        ? { conversationId: context.conversationId }
        : undefined,
    conversationId:
      typeof value.conversationId === "string" ? value.conversationId : undefined,
    language: value.language,
  };
}

function getConversationIdFromBody(body: RespondRouteBody): string | undefined {
  if (typeof body.context?.conversationId === "string") {
    return body.context.conversationId;
  }

  return typeof body.conversationId === "string"
    ? body.conversationId
    : undefined;
}

function getRawMessages(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeSurveyMedia(value: unknown): SurveyMedia[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.type !== "string" || typeof item.url !== "string") {
      return [];
    }

    if (
      item.type !== "image" &&
      item.type !== "audio" &&
      item.type !== "video"
    ) {
      return [];
    }

    return [{
      type: item.type,
      url: item.url,
      description: typeof item.description === "string" ? item.description : undefined,
      mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
      altText: typeof item.altText === "string" ? item.altText : undefined,
      durationMs: typeof item.durationMs === "number" ? item.durationMs : undefined,
      id: typeof item.id === "string" ? item.id : undefined,
    }];
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const { shareableLink } = await params;
    const { searchParams } = new URL(request.url);
    const existingConversationId = searchParams.get("conversationId");
    const language = getRequestedLanguage(searchParams.get("language"));

    const survey = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, shareableLink))
      .then((rows) => rows[0]);

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }
    if (survey.status !== "active") {
      return NextResponse.json(
        { error: "Survey is not active" },
        { status: 403 },
      );
    }

    if (existingConversationId) {
      const [existingConversation] = await getDb()
        .select()
        .from(surveyConversations)
        .where(eq(surveyConversations.id, existingConversationId));

      if (existingConversation && existingConversation.surveyId === survey.id) {
        const usableMessages = getUsableRespondentMessages(
          toVisibleConversationMessages(
            toPersistedUIChatMessages(
              getRawMessages(existingConversation.rawConversation),
              ["user", "assistant"],
            ),
          ),
          survey.isVoice,
        );

        if (existingConversation.completed) {
          return NextResponse.json({
            completed: true,
            survey: { title: survey.title, isVoice: survey.isVoice },
          });
        }

        return NextResponse.json({
          survey: {
            id: survey.id,
            title: survey.title,
            objective: survey.coreObjective,
            tone: survey.tone,
            requiredQuestions: survey.requiredQuestions || [],
            isVoice: survey.isVoice,
            media: normalizeSurveyMedia(survey.media),
            programId: survey.programId,
          },
          conversationId: existingConversation.id,
          participantId: existingConversation.participantId,
          messages: usableMessages,
        });
      }
    }

    if (
      survey.deliveryMode !== "classroom_assigned" &&
      survey.currentParticipants >= survey.participantLimit
    ) {
      return NextResponse.json(
        { error: "Survey has reached its participant limit" },
        { status: 403 },
      );
    }

    const conversationId = nanoid();
    const participantId = nanoid(8);
    const greetingText = buildRespondentVoiceGreeting({
      language: getRequestedLanguage(language || survey.language) || "en",
      surveyTitle: survey.title,
      brief: null,
    });
    const greetingMessage = survey.isVoice
      ? null
      : {
          id: nanoid(),
          role: "assistant" as const,
          content: greetingText,
          parts: [{ type: "text" as const, text: greetingText }],
          timestamp: new Date().toISOString(),
        };

    await getDb().insert(surveyConversations).values({
      id: conversationId,
      surveyId: survey.id,
      participantId,
      rawConversation: greetingMessage ? [greetingMessage] : [],
      completed: false,
      originalLanguage: language || survey.language || "en",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      survey: {
        id: survey.id,
        title: survey.title,
        objective: survey.coreObjective,
        tone: survey.tone,
        requiredQuestions: survey.requiredQuestions || [],
        isVoice: survey.isVoice,
        media: normalizeSurveyMedia(survey.media),
        programId: survey.programId,
      },
      conversationId,
      participantId,
      messages: greetingMessage ? [greetingMessage] : [],
    });
  } catch (error) {
    console.error("Error initializing survey response:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const body = parseRespondRouteBody(await req.json());
    const rawMessages = getRawMessages(body.messages);
    const language = getRequestedLanguage(body.language);
    const { shareableLink } = await params;

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, shareableLink))
      .limit(1);
    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }
    if (survey.status !== "active") {
      return NextResponse.json(
        { error: "Survey is not active" },
        { status: 403 },
      );
    }

    const conversationId = getConversationIdFromBody(body);
    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID is required" },
        { status: 400 },
      );
    }

    const [conversation, briefRow, planRow] = await Promise.all([
      getDb()
        .select()
        .from(surveyConversations)
        .where(eq(surveyConversations.id, conversationId))
        .then((rows) => rows[0]),
      getResearchBrief(survey.id),
      getActiveCoveragePlan(survey.id),
    ]);

    if (!conversation || conversation.surveyId !== survey.id) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    if (!briefRow || !planRow) {
      return NextResponse.json(
        { error: "This survey does not have an approved education brief yet." },
        { status: 400 },
      );
    }

    const persistedIncomingMessages = toPersistedUIChatMessages(rawMessages, [
      "user",
      "assistant",
    ]);
    const visibleMessages = toVisibleConversationMessages(
      persistedIncomingMessages,
    );

    if (
      !hasUserTurn(
        toPersistedUIChatMessages(
          getRawMessages(conversation.rawConversation),
          ["user", "assistant"],
        ),
      ) &&
      visibleMessages.some((message) => message.role === "user")
    ) {
      const admission = await admitParticipantOnFirstUserTurn({
        surveyId: survey.id,
        conversationId: conversation.id,
        enforceParticipantLimit: survey.deliveryMode !== "classroom_assigned",
      });

      if (!admission.allowed) {
        return NextResponse.json(
          { error: "Survey has reached participant limit" },
          { status: 403 },
        );
      }
    }

    let sessionRow = await getSessionBySourceId(conversation.id);
    if (!sessionRow) {
      sessionRow = await ensureSession({
        surveyId: survey.id,
        sessionType: "live",
        sourceConversationId: conversation.id,
        language: getRequestedLanguage(language || survey.language) || "en",
        respondentId: conversation.participantId,
        initialState: createInitialSessionState({
          surveyId: survey.id,
          sessionId: nanoid(),
          sessionType: "live",
          language: getRequestedLanguage(language || survey.language) || "en",
          coveragePlan: planRow.plan,
        }),
      });
    }

    const [activeLiveProfile, sampleFallbackProfile, runtimeLayers] =
      await Promise.all([
        getActiveConductingProfile(survey.id, "live"),
        getActiveConductingProfile(survey.id, "sample"),
        getConductingRuntimeLayers({
          surveyId: survey.id,
          organizationId: survey.organizationId,
          mode: "live",
        }),
      ]);

    const promptParts = buildConductingSystemPromptParts({
      brief: briefRow.brief,
      coveragePlan: planRow.plan,
      sessionState: sessionRow.sessionState,
      sessionType: "live",
      conductingProfile:
        activeLiveProfile?.profile ?? sampleFallbackProfile?.profile ?? null,
      playbookContext: runtimeLayers.playbookContext,
      personalityContext: runtimeLayers.personalityContext,
      toolContext: {
        canFinishSurvey: true,
        canShowMedia: (survey.media || []).length > 0,
      },
    });
    const systemPrompt = `${promptParts.dynamicSystemPrompt}

Respond to the user in the language they are speaking to you in. Match the language of each user message naturally.`;

    let currentSessionState = sessionRow.sessionState;
    let completedByTool = false;
    const hasMedia = (survey.media || []).length > 0;

    const tools = {
      finishSurvey: tool({
        description: getRespondentFinishSurveyToolDefinition().description,
        inputSchema: z.object({}),
        execute: async () => {
          const threshold =
            planRow.plan.completionRule.minimumRequiredNodeCoverage;
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
      ...(hasMedia
        ? {
            showMedia: tool({
              description: getShowMediaToolDefinition().description,
              inputSchema: z.object({
                mediaId: z.string().describe("The media identifier to display."),
              }),
              execute: async ({ mediaId }: { mediaId: string }) => {
                const media = normalizeSurveyMedia(survey.media).find(
                  (item) => item.id === mediaId,
                );
                if (!media) {
                  return { error: "Media not found" };
                }

                return {
                  success: true,
                  media: {
                    id: media.id,
                    type: media.type,
                    url: media.url,
                    description: media.description,
                    altText: media.altText,
                    durationMs: media.durationMs,
                  },
                };
              },
            }),
          }
        : {}),
    };

    const modelMessages =
      rawMessages.length > 0
        ? await toModelMessages(rawMessages)
        : [
            {
              role: "user" as const,
              content:
                "Start the interview by greeting the participant and asking the first best question.",
            },
          ];

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
      },
    );

    return result.toUIMessageStreamResponse({
      originalMessages: toUIMessages(persistedIncomingMessages),
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
              brief: briefRow.brief,
              coveragePlan: planRow.plan,
              sessionState: currentSessionState,
              messages: persistedMessages,
            });
            currentSessionState = nextState;
          }

          await enqueueConversationInsights({
            conversationId: conversation.id,
            surveyId: survey.id,
            userId: survey.userId,
          }).catch((error) => {
            console.error(
              "[Respond Route] Failed to enqueue analytics refresh:",
              error,
            );
          });

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
  } catch (error) {
    console.error("[Respond Route] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
