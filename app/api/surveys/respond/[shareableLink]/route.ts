import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  tool,
} from "ai";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

import { z } from "zod";
import { getDb } from "@/db";
import { classroomStudents, surveyConversations, surveys } from "@/db/schema";
import {
  normalizeMessages as toModelMessages,
  streamAIResponse,
} from "@/lib/ai";
import {
  toPersistedUIChatMessages,
  toUIMessages,
  toVisibleConversationMessages,
} from "@/lib/chat-ui-messages";
import {
  buildConductingSystemPromptParts,
  createInitialSessionState,
  finalizeConductingTurn,
} from "@/lib/education/conducting-runtime";
import {
  getRespondentFinishSurveyToolDefinition,
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
import type { ChatMessage } from "@/lib/chat-types";
import {
  RESPONDENT_RESUME_QUERY_PARAM,
  getRespondentSessionCookieName,
  getRespondentSessionCookieOptions,
  issueRespondentSessionToken,
  resolveRespondentAccess,
} from "@/lib/privacy/respondent";
import { getVerifiedSession } from "@/lib/auth/session";
import { evaluateScopePolicy, renderStrictScopePolicyInstructions } from "@/lib/ai/scope-policy";
import { recordAiFeedbackEvent } from "@/lib/ai/observability";
import { getClientIP } from "@/lib/ratelimit";

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

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

type ClassroomAssignedAccess =
  | {
      mode: "classroom_assigned";
      classroomStudent: {
        id: string;
        userId: string | null;
      };
    }
  | { mode: "link" };

async function resolveClassroomAssignedAccess(
  survey: typeof surveys.$inferSelect,
): Promise<
  | { success: true; data: ClassroomAssignedAccess }
  | { success: false; response: NextResponse }
> {
  if (survey.deliveryMode !== "classroom_assigned") {
    return {
      success: true,
      data: { mode: "link" },
    };
  }

  if (!survey.classroomId) {
    return {
      success: false,
      response: jsonNoStore(
        { error: "Classroom-assigned survey is misconfigured" },
        { status: 400 },
      ),
    };
  }

  const session = await getVerifiedSession().catch(() => null);
  if (!session) {
    return {
      success: false,
      response: jsonNoStore(
        { error: "Sign in with your classroom account to access this survey" },
        { status: 403 },
      ),
    };
  }

  const classroomStudent = await getDb().query.classroomStudents.findFirst({
    where: and(
      eq(classroomStudents.classroomId, survey.classroomId),
      eq(classroomStudents.userId, session.user.id),
    ),
    columns: {
      id: true,
      userId: true,
    },
  });

  if (!classroomStudent) {
    return {
      success: false,
      response: jsonNoStore(
        { error: "You do not have access to this classroom survey" },
        { status: 403 },
      ),
    };
  }

  return {
    success: true,
    data: {
      mode: "classroom_assigned",
      classroomStudent,
    },
  };
}

function buildSurveyResponsePayload(survey: typeof surveys.$inferSelect) {
  return {
    id: survey.id,
    title: survey.title,
    objective: survey.coreObjective,
    tone: survey.tone,
    requiredQuestions: survey.requiredQuestions || [],
    isVoice: survey.isVoice,
    programId: survey.programId,
  };
}

async function respondWithExistingConversation(input: {
  request: Request;
  survey: typeof surveys.$inferSelect;
  conversation: typeof surveyConversations.$inferSelect;
}) {
  const respondentSessionToken = await issueRespondentSessionToken({
    surveyId: input.survey.id,
    conversationId: input.conversation.id,
    participantId: input.conversation.participantId,
    ipAddress: getClientIP(input.request),
    userAgent: input.request.headers.get("user-agent"),
  });
  const usableMessages = getUsableRespondentMessages(
    toVisibleConversationMessages(
      toPersistedUIChatMessages(
        getRawMessages(input.conversation.rawConversation),
        ["user", "assistant"],
      ),
    ),
    input.survey.isVoice,
  );

  if (input.conversation.completed) {
    const completedResponse = jsonNoStore({
      completed: true,
      survey: {
        id: input.survey.id,
        title: input.survey.title,
        isVoice: input.survey.isVoice,
      },
      conversationId: input.conversation.id,
      participantId: input.conversation.participantId,
    });
    completedResponse.cookies.set(
      getRespondentSessionCookieName(input.survey.id),
      respondentSessionToken,
      getRespondentSessionCookieOptions(),
    );
    return completedResponse;
  }

  const response = jsonNoStore({
    survey: buildSurveyResponsePayload(input.survey),
    conversationId: input.conversation.id,
    participantId: input.conversation.participantId,
    messages: usableMessages,
  });
  response.cookies.set(
    getRespondentSessionCookieName(input.survey.id),
    respondentSessionToken,
    getRespondentSessionCookieOptions(),
  );
  return response;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const { shareableLink } = await params;
    const { searchParams } = new URL(request.url);
    const language = getRequestedLanguage(searchParams.get("language"));
    const resumeToken = searchParams.get(RESPONDENT_RESUME_QUERY_PARAM);

    const survey = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, shareableLink))
      .then((rows) => rows[0]);

    if (!survey) {
      return jsonNoStore({ error: "Survey not found" }, { status: 404 });
    }
    if (survey.status !== "active") {
      return jsonNoStore(
        { error: "Survey is not active" },
        { status: 403 },
      );
    }

    const access = await resolveClassroomAssignedAccess(survey);
    if (!access.success) {
      return access.response;
    }

    const authorizedAccess = await resolveRespondentAccess({
      cookieHeader: request.headers.get("cookie"),
      surveyId: survey.id,
      explicitToken: resumeToken,
      sessionAllowedScopes: ["respondent_session"],
      explicitAllowedScopes: ["respondent_resume"],
      clientIp: getClientIP(request),
      userAgent: request.headers.get("user-agent"),
    });
    const existingConversationId = authorizedAccess?.conversationId ?? null;

    if (existingConversationId) {
      const [existingConversation] = await getDb()
        .select()
        .from(surveyConversations)
        .where(eq(surveyConversations.id, existingConversationId));

      if (existingConversation && existingConversation.surveyId === survey.id) {
        if (
          access.data.mode === "classroom_assigned" &&
          existingConversation.participantId !== access.data.classroomStudent.id
        ) {
          return jsonNoStore({ error: "Unauthorized" }, { status: 403 });
        }

        return respondWithExistingConversation({
          request,
          survey,
          conversation: existingConversation,
        });
      }
    }

    if (
      survey.deliveryMode !== "classroom_assigned" &&
      survey.currentParticipants >= survey.participantLimit
    ) {
      return jsonNoStore(
        { error: "Survey has reached its participant limit" },
        { status: 403 },
      );
    }

    if (access.data.mode === "classroom_assigned") {
      const existingClassroomConversation = await getDb()
        .select()
        .from(surveyConversations)
        .where(
          and(
            eq(surveyConversations.surveyId, survey.id),
            eq(
              surveyConversations.participantId,
              access.data.classroomStudent.id,
            ),
          ),
        )
        .orderBy(desc(surveyConversations.updatedAt))
        .then((rows) => rows[0] ?? null);

      if (existingClassroomConversation) {
        return respondWithExistingConversation({
          request,
          survey,
          conversation: existingClassroomConversation,
        });
      }
    }

    const conversationId = nanoid();
    const participantId =
      access.data.mode === "classroom_assigned"
        ? access.data.classroomStudent.id
        : nanoid(8);
    const respondentSessionToken = await issueRespondentSessionToken({
      surveyId: survey.id,
      conversationId,
      participantId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get("user-agent"),
    });
    const greetingText = buildRespondentVoiceGreeting({
      language: getRequestedLanguage(language || survey.language) || "en",
      surveyTitle: survey.title,
      brief: null,
    });
    const greetingMessage: ChatMessage | null = survey.isVoice
      ? null
      : {
          id: nanoid(),
          role: "assistant",
          content: greetingText,
          parts: [{ type: "text", text: greetingText }],
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

    const response = jsonNoStore({
      survey: {
        id: survey.id,
        title: survey.title,
        objective: survey.coreObjective,
        tone: survey.tone,
        requiredQuestions: survey.requiredQuestions || [],
        isVoice: survey.isVoice,
        programId: survey.programId,
      },
      conversationId,
      participantId,
      messages: greetingMessage ? [greetingMessage] : [],
    });
    response.cookies.set(
      getRespondentSessionCookieName(survey.id),
      respondentSessionToken,
      getRespondentSessionCookieOptions(),
    );
    return response;
  } catch {
    return jsonNoStore(
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
      return jsonNoStore({ error: "Survey not found" }, { status: 404 });
    }
    if (survey.status !== "active") {
      return jsonNoStore(
        { error: "Survey is not active" },
        { status: 403 },
      );
    }

    const conversationId = getConversationIdFromBody(body);
    if (!conversationId) {
      return jsonNoStore(
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
    const access = await resolveClassroomAssignedAccess(survey);
    if (!access.success) {
      return access.response;
    }

    if (!conversation || conversation.surveyId !== survey.id) {
      return jsonNoStore(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    if (
      access.data.mode === "classroom_assigned" &&
      conversation.participantId !== access.data.classroomStudent.id
    ) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 403 });
    }
    const respondentAccess = await resolveRespondentAccess({
      cookieHeader: req.headers.get("cookie"),
      surveyId: survey.id,
      conversationId: conversation.id,
      sessionAllowedScopes: ["respondent_session"],
      clientIp: getClientIP(req),
      userAgent: req.headers.get("user-agent"),
    });
    if (!respondentAccess) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 403 });
    }
    if (!briefRow || !planRow) {
      return jsonNoStore(
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
    const latestUserMessage =
      [...visibleMessages]
        .reverse()
        .find((message) => message.role === "user")
        ?.content?.trim() ?? "";

    if (latestUserMessage) {
      const priorDriftCount = toPersistedUIChatMessages(
        getRawMessages(conversation.rawConversation),
        ["user", "assistant"],
      ).filter(
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
        activeTopic: planRow.plan.nodes[0]?.label ?? survey.title,
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
        return jsonNoStore(
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
          classroomId: survey.classroomId,
          programId: survey.programId,
          language:
            getRequestedLanguage(language || survey.language) ||
            survey.language ||
            "en",
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
  activeTopic: planRow.plan.nodes[0]?.label ?? survey.title,
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
    };

    const starterMessages: Awaited<ReturnType<typeof toModelMessages>> = [
      {
        role: "user",
        content:
          "Start the interview by greeting the participant and asking the first best question.",
      },
    ];
    const modelMessages =
      rawMessages.length > 0
        ? await toModelMessages(rawMessages)
        : starterMessages;

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
          }).catch(() => {
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
  } catch {
    return jsonNoStore(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

