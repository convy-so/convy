import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  type ModelMessage,
} from "ai";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { normalizeMessages as toModelMessages, streamAIResponse } from "@/shared/ai";
import { getDynamicFewShotExamples } from "@/shared/ai/few-shot-library";
import { sanitizeUserInput } from "@/shared/ai/sanitization";
import { evaluateScopePolicy } from "@/shared/ai/scope-policy";
import { getDb } from "@/shared/db";
import { sampleConversations, surveys } from "@/shared/db/schema";
import {
  toPersistedUIChatMessages,
  toVisibleConversationMessages,
} from "@/shared/chat/chat-ui-messages";
import { SURVEY_COMPLETION_TAG } from "@/shared/chat/chat-ui-signals";
import type { ChatMessage } from "@/shared/chat/chat-types";
import { apiError } from "@/shared/http/api-error";
import type { AuthSessionWithUser } from "@/features/auth/public-server";
import {
  acquireSurveyLease,
  getActiveSurveyLease,
  getCurrentSurveyRevision,
  incrementSurveyRevision,
} from "@/features/surveys/server/collaboration-service";
import {
  buildConductingSystemPromptParts,
  createInitialSessionState,
  evaluateConductingTurnState,
  persistConductingTurnTranscript,
  planConductingTurn,
  resolveActiveCoverageNode,
  resolveConductingTurnPlan,
} from "@/features/surveys/server/education/conducting-runtime";
import { getConductingRuntimeLayers } from "@/features/surveys/server/education/runtime-context";
import {
  ensureSession,
  getActiveConductingProfile,
  getActiveCoveragePlan,
  getResearchBrief,
  getSessionBySourceId,
  purgeSessionAnalyticsArtifacts,
  updateSessionState,
} from "@/features/surveys/server/education/storage";
import type { SessionState } from "@/features/surveys/server/education/types";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import { buildCanonicalConversationTurn } from "@/features/surveys/server/respondent-conversation";
import { requireValue } from "@/shared/utils/collections";

import { createSampleFinishSurveyTool } from "./sample-finish-tool";

export const MAX_SAMPLE_CONVERSATIONS = 3;

export type SubmitSampleRouteBody = {
  conversationNumber?: number;
  messages?: unknown[];
  expectedRevision?: number;
  sessionId?: string;
  leaseToken?: string;
  forceLease?: boolean;
};

type SupportedLanguage = "en" | "fr" | "de" | "es" | "it";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseSampleRouteBody(value: unknown): SubmitSampleRouteBody {
  if (!isRecord(value)) return {};
  return {
    conversationNumber:
      typeof value.conversationNumber === "number"
        ? value.conversationNumber
        : undefined,
    messages: Array.isArray(value.messages) ? value.messages : undefined,
    expectedRevision:
      typeof value.expectedRevision === "number"
        ? value.expectedRevision
        : undefined,
    sessionId: typeof value.sessionId === "string" ? value.sessionId : undefined,
    leaseToken:
      typeof value.leaseToken === "string" ? value.leaseToken : undefined,
    forceLease:
      typeof value.forceLease === "boolean" ? value.forceLease : undefined,
  };
}

function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return (
    value === "en" ||
    value === "fr" ||
    value === "de" ||
    value === "es" ||
    value === "it"
  );
}

function getSurveyLanguage(value: unknown): SupportedLanguage {
  return isSupportedLanguage(value) ? value : "en";
}

async function ensureRehearsalLease(input: {
  surveyId: string;
  userId: string;
  sessionId?: string | null;
  leaseToken?: string | null;
  force?: boolean;
}) {
  const activeLease = await getActiveSurveyLease(input.surveyId, "rehearsal");
  if (
    activeLease &&
    activeLease.holderUserId !== input.userId &&
    (!input.leaseToken || input.leaseToken !== activeLease.leaseToken)
  ) {
    return { ok: false as const, error: "LEASE_CONFLICT", lease: activeLease };
  }
  if (
    activeLease &&
    activeLease.holderUserId === input.userId &&
    input.leaseToken === activeLease.leaseToken
  ) {
    return { ok: true as const, lease: activeLease };
  }
  return acquireSurveyLease({
    surveyId: input.surveyId,
    stage: "rehearsal",
    userId: input.userId,
    sessionId: input.sessionId,
    force: input.force,
  });
}

async function ensureSampleConversation(params: {
  surveyId: string;
  survey: typeof surveys.$inferSelect;
  conversationNumber: number;
}) {
  let [sampleConversation] = await getDb()
    .select()
    .from(sampleConversations)
    .where(
      and(
        eq(sampleConversations.surveyId, params.surveyId),
        eq(sampleConversations.conversationNumber, params.conversationNumber),
      ),
    )
    .limit(1);

  if (!sampleConversation) {
    const [created] = await getDb()
      .insert(sampleConversations)
      .values({
        id: `sample-${params.surveyId}-${params.conversationNumber}`,
        surveyId: params.surveyId,
        conversationNumber: params.conversationNumber,
        messages: [],
        confirmed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    sampleConversation = requireValue(
      created,
      `Failed to create sample conversation ${params.conversationNumber} for survey ${params.surveyId}`,
    );
    await getDb()
      .update(surveys)
      .set({
        sampleConversationCount: Math.max(
          params.survey.sampleConversationCount,
          params.conversationNumber,
        ),
        updatedAt: new Date(),
      })
      .where(eq(surveys.id, params.surveyId));
  }

  return sampleConversation;
}

function countScopeRedirects(messages: unknown[]) {
  return toPersistedUIChatMessages(messages, ["user", "assistant"]).filter(
    (message) =>
      message.role === "assistant" &&
      /let's stay focused on|we need to stay on the current objective/i.test(
        message.content,
      ),
  ).length;
}

function sanitizeSampleMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    if (message.role !== "user") {
      return message;
    }

    return {
      ...message,
      content: sanitizeUserInput(message.content, {
        maxLength: 2000,
        allowNewlines: true,
      }),
    };
  });
}

async function persistSampleRedirect(params: {
  conversationId: string;
  messages: ChatMessage[];
  redirectMessage: ChatMessage;
}) {
  const redirectedMessages = toVisibleConversationMessages([
    ...params.messages,
    params.redirectMessage,
  ]);
  await getDb()
    .update(sampleConversations)
    .set({
      messages: redirectedMessages,
      updatedAt: new Date(),
    })
    .where(eq(sampleConversations.id, params.conversationId));
}

function createSingleMessageStreamResponse(params: {
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

function buildSampleSystemPrompt(params: {
  dynamicSystemPrompt: string;
}) {
  return `${params.dynamicSystemPrompt}

Additional sample-session rules:
- Treat the creator exactly like a participant so they can feel the real interview flow.
- Honor the approved sample conducting profile precisely when it is present.
- Close naturally once the required education evidence is covered.
- Keep the exchange realistic and participant-centered.

Respond to the user in the language they are speaking to you in. Match the language of each user message naturally.`;
}

async function buildSampleModelMessages(
  messages: ChatMessage[],
): Promise<ModelMessage[]> {
  const sanitizedCanonicalMessages = sanitizeSampleMessages(messages);

  return sanitizedCanonicalMessages.length > 0
    ? await toModelMessages(sanitizedCanonicalMessages)
    : [
        {
          role: "user",
          content:
            "Start the sample interview by greeting the participant and asking the first best question.",
        },
      ];
}

function applySampleResponseHeaders(
  response: Response,
  params: {
    revision: number;
    leaseToken: string;
    conversationNumber: number;
    remainingSamples: number;
  },
) {
  response.headers.set("X-Remaining-Samples", String(params.remainingSamples));
  response.headers.set(
    "X-Conversation-Number",
    String(params.conversationNumber),
  );
  response.headers.set("X-Survey-Revision", String(params.revision));
  response.headers.set("X-Lease-Token", params.leaseToken);
}

async function finalizePlannedSampleTurn(params: {
  surveyId: string;
  conversationId: string;
  sessionId: string;
  leaseToken: string;
  conversationNumber: number;
  assistantMessage: string;
  rationale: string;
  currentSessionState: SessionState;
  canonicalMessages: ChatMessage[];
}) {
  const completionText = `${SURVEY_COMPLETION_TAG} ${params.assistantMessage.trim() || "Thank you. That gives me enough to stop this rehearsal."}`.trim();
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
    .update(sampleConversations)
    .set({
      messages: toVisibleConversationMessages([
        ...params.canonicalMessages,
        completionMessage,
      ]),
      updatedAt: new Date(),
    })
    .where(eq(sampleConversations.id, params.conversationId));
  await purgeSessionAnalyticsArtifacts({
    surveyId: params.surveyId,
    sessionId: params.sessionId,
  }).catch((error) => {
    console.error(
      "[Sample Route] Failed to purge rehearsal analytics artifacts:",
      error,
    );
  });

  const response = createSingleMessageStreamResponse({
    messageId: completionMessage.id,
    text: completionText,
  });
  applySampleResponseHeaders(response, {
    remainingSamples: MAX_SAMPLE_CONVERSATIONS - params.conversationNumber,
    conversationNumber: params.conversationNumber,
    revision: await incrementSurveyRevision(params.surveyId),
    leaseToken: params.leaseToken,
  });
  return response;
}

async function persistSampleStreamResult(params: {
  surveyId: string;
  conversationId: string;
  sessionId: string;
  messages: unknown[];
}) {
  const persistedMessages = toVisibleConversationMessages(
    toPersistedUIChatMessages(params.messages, ["user", "assistant"]),
  );

  await getDb()
    .update(sampleConversations)
    .set({
      messages: persistedMessages,
      updatedAt: new Date(),
    })
    .where(eq(sampleConversations.id, params.conversationId));
  await incrementSurveyRevision(params.surveyId).catch((error) => {
    console.error("[Sample Route] Failed to increment survey revision:", error);
  });

  if (persistedMessages.some((message) => message.role === "user")) {
    await persistConductingTurnTranscript({
      surveyId: params.surveyId,
      sessionId: params.sessionId,
      messages: persistedMessages,
    });

    await purgeSessionAnalyticsArtifacts({
      surveyId: params.surveyId,
      sessionId: params.sessionId,
    }).catch((error) => {
      console.error(
        "[Sample Route] Failed to purge rehearsal analytics artifacts:",
        error,
      );
    });
  }
}

export async function submitSampleTurn(input: {
  surveyId: string;
  session: AuthSessionWithUser;
  body: SubmitSampleRouteBody;
}): Promise<Response> {
  const { surveyId, session, body } = input;
  const conversationNumber = Number(body.conversationNumber || 1);
  const rawMessages = body.messages ?? [];

  if (
    conversationNumber < 1 ||
    conversationNumber > MAX_SAMPLE_CONVERSATIONS
  ) {
    return apiError(
      "VALIDATION_ERROR",
      `Invalid conversation number. Must be between 1 and ${MAX_SAMPLE_CONVERSATIONS}`,
    );
  }

  const [survey] = await getDb()
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));
  if (!survey) {
    return apiError("NOT_FOUND", "Survey not found");
  }

  const permission = await getSurveyPermissionForSession(session, survey.id);
  if (!hasSurveyPermission(permission, "canEdit")) {
    return apiError("UNAUTHORIZED", "Editor access required");
  }
  if (survey.status !== "draft" && survey.status !== "sample_review") {
    return apiError(
      "VALIDATION_ERROR",
      "Survey must be in draft or sample_review status for sample conversations",
    );
  }

  const currentRevision = await getCurrentSurveyRevision(surveyId);
  if (
    typeof body.expectedRevision === "number" &&
    body.expectedRevision !== currentRevision
  ) {
    return apiError("CONFLICT", "REVISION_CONFLICT", {
      details: { currentRevision },
    });
  }

  const leaseResult = await ensureRehearsalLease({
    surveyId,
    userId: session.user.id,
    sessionId:
      typeof body.sessionId === "string" ? body.sessionId : session.session.id,
    leaseToken: typeof body.leaseToken === "string" ? body.leaseToken : null,
    force: Boolean(body.forceLease),
  });

  if (!leaseResult.ok) {
    return apiError("CONFLICT", leaseResult.error, {
      details: {
        lease: "lease" in leaseResult ? leaseResult.lease : null,
      },
    });
  }

  const [briefRow, planRow] = await Promise.all([
    getResearchBrief(surveyId),
    getActiveCoveragePlan(surveyId),
  ]);
  if (!briefRow || !planRow) {
    return apiError(
      "VALIDATION_ERROR",
      "This survey does not have an approved education brief yet.",
    );
  }

  const [activeSampleProfile, runtimeLayers] = await Promise.all([
    getActiveConductingProfile(surveyId, "sample"),
    getConductingRuntimeLayers({
      surveyId,
      classroomId: survey.classroomId,
      programId: survey.programId,
      language: getSurveyLanguage(survey.language),
      mode: "sample",
    }),
  ]);

  const sampleConversation = await ensureSampleConversation({
    surveyId,
    survey,
    conversationNumber,
  });

  const canonicalTurn = buildCanonicalConversationTurn({
    storedMessages: sampleConversation.messages ?? [],
    incomingMessages: rawMessages,
  });
  const latestUserMessage = canonicalTurn.latestUserMessage;

  const sourceId = sampleConversation.id;
  let sessionRow = await getSessionBySourceId(sourceId);
  if (!sessionRow) {
    sessionRow = await ensureSession({
      surveyId,
      sessionType: "sample",
      sourceConversationId: sourceId,
      language: getSurveyLanguage(survey.language),
      initialState: createInitialSessionState({
        surveyId,
        sessionId: nanoid(),
        sessionType: "sample",
        language: getSurveyLanguage(survey.language),
        coveragePlan: planRow.plan,
      }),
    });
  }
  const activeNode = resolveActiveCoverageNode(
    sessionRow.sessionState,
    planRow.plan,
  );

  let currentSessionState = sessionRow.sessionState;

  const tools = {
    finishSurvey: createSampleFinishSurveyTool({
      sessionId: sessionRow.id,
      minimumCoverage: planRow.plan.completionRule.minimumRequiredNodeCoverage,
      getCurrentSessionState: () => currentSessionState,
      setCurrentSessionState: (nextState) => {
        currentSessionState = nextState;
      },
    }),
  };

  const priorDriftCount = countScopeRedirects(sampleConversation.messages ?? []);
  if (latestUserMessage) {
    const scopeDecision = await evaluateScopePolicy({
      feature: "survey_sample",
      objective: briefRow.brief.researchGoal,
      currentPhase: "sample review",
      activeTopic: activeNode?.label ?? briefRow.brief.title,
      latestUserMessage,
      strictMode: true,
      driftCount: priorDriftCount,
      allowedDetours: [
        "brief clarification of the current interview question",
        "discussion tied directly to the approved survey brief",
      ],
    });

    if (scopeDecision.shouldRedirect) {
      const redirectMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: scopeDecision.redirectMessage,
        parts: [{ type: "text", text: scopeDecision.redirectMessage }],
        timestamp: new Date().toISOString(),
      };
      await persistSampleRedirect({
        conversationId: sampleConversation.id,
        messages: canonicalTurn.canonicalMessages,
        redirectMessage,
      });
      const revision = await incrementSurveyRevision(surveyId);

      const response = createSingleMessageStreamResponse({
        messageId: redirectMessage.id,
        text: scopeDecision.redirectMessage,
      });
      response.headers.set("X-Survey-Revision", String(revision));
      response.headers.set("X-Lease-Token", leaseResult.lease.leaseToken);
      return response;
    }
  }

  if (latestUserMessage) {
    const { nextState } = await evaluateConductingTurnState({
      surveyId,
      sessionId: sessionRow.id,
      brief: briefRow.brief,
      coveragePlan: planRow.plan,
      sessionState: currentSessionState,
      messages: canonicalTurn.canonicalMessages,
    });
    currentSessionState = nextState;
  }

  const planningActiveNode = resolveActiveCoverageNode(
    currentSessionState,
    planRow.plan,
  );
  const rawTurnPlan = await planConductingTurn({
    surveyId,
    brief: briefRow.brief,
    coveragePlan: planRow.plan,
    sessionState: currentSessionState,
    messages: canonicalTurn.canonicalMessages,
  });
  const turnPlan = resolveConductingTurnPlan({
    coveragePlan: planRow.plan,
    sessionState: currentSessionState,
    messages: canonicalTurn.canonicalMessages,
    plan: rawTurnPlan,
  });
  const promptSessionState =
    turnPlan?.action === "advance_to_node" && turnPlan.targetNodeId
      ? {
          ...currentSessionState,
          currentNodeId: turnPlan.targetNodeId,
        }
      : currentSessionState;
  const plannedActiveNode =
    turnPlan?.action === "advance_to_node" && turnPlan.targetNodeId
      ? planRow.plan.nodes.find((node) => node.id === turnPlan.targetNodeId) ??
        planningActiveNode
      : planningActiveNode;

  if (turnPlan?.action === "close") {
    return finalizePlannedSampleTurn({
      surveyId,
      conversationId: sampleConversation.id,
      sessionId: sessionRow.id,
      leaseToken: leaseResult.lease.leaseToken,
      conversationNumber,
      assistantMessage: turnPlan.assistantMessage,
      rationale: turnPlan.reason,
      currentSessionState,
      canonicalMessages: canonicalTurn.canonicalMessages,
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
    brief: briefRow.brief,
    coveragePlan: planRow.plan,
    sessionState: promptSessionState,
    sessionType: "sample",
    turnPlan,
    conductingProfile: activeSampleProfile?.profile ?? null,
    expertGuidanceContext: runtimeLayers.expertGuidanceContext,
    toolContext: {
      canFinishSurvey: true,
      canShowMedia: false,
    },
  });
  const systemPrompt = buildSampleSystemPrompt({
    dynamicSystemPrompt: promptParts.dynamicSystemPrompt,
  });

  const modelMessages = await buildSampleModelMessages(
    canonicalTurn.canonicalMessages,
  );

  const result = streamAIResponse(modelMessages, systemPrompt, {
    attribution: {
      surveyId,
      userId: session.user.id,
      feature: "survey-conducting-sample",
    },
    maxTokens: 500,
    temperature: 0.4,
    promptCache: {
      namespace: "conducting-sample",
      staticSystemPrompt: promptParts.staticSystemPrompt,
    },
    tools,
    stopWhen: stepCountIs(5),
    dynamicExamples: fewShotExamples,
  });

  const remainingSamples = MAX_SAMPLE_CONVERSATIONS - conversationNumber;
  const response = result.toUIMessageStreamResponse({
    originalMessages: canonicalTurn.originalMessages,
    onFinish: async ({ messages }) => {
      await persistSampleStreamResult({
        surveyId,
        conversationId: sampleConversation.id,
        sessionId: sessionRow.id,
        messages,
      });
    },
  });

  applySampleResponseHeaders(response, {
    remainingSamples,
    conversationNumber,
    revision: currentRevision + 1,
    leaseToken: leaseResult.lease.leaseToken,
  });
  return response;
}
