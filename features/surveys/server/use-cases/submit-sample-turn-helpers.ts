import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
} from "ai";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { normalizeMessages as toModelMessages } from "@/shared/ai";
import { getDb } from "@/shared/db";
import { sampleConversations, surveys } from "@/shared/db/schema";
import { sanitizeUserInput } from "@/shared/ai/sanitization";
import {
  acquireSurveyLease,
  getActiveSurveyLease,
  incrementSurveyRevision,
} from "@/features/surveys/server/collaboration-service";
import {
  toPersistedUIChatMessages,
  toVisibleConversationMessages,
} from "@/shared/chat/chat-ui-messages";
import { SURVEY_COMPLETION_TAG } from "@/shared/chat/chat-ui-signals";
import type { ChatMessage } from "@/shared/chat/chat-types";
import {
  persistConductingTurnTranscript,
} from "@/features/surveys/server/education/conducting-runtime";
import {
  purgeSessionAnalyticsArtifacts,
  updateSessionState,
} from "@/features/surveys/server/education/storage";
import type { SessionState } from "@/features/surveys/server/education/types";
import { requireValue } from "@/shared/utils/collections";

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

export function getSurveyLanguage(value: unknown): SupportedLanguage {
  return isSupportedLanguage(value) ? value : "en";
}

export async function ensureRehearsalLease(input: {
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

export async function ensureSampleConversation(params: {
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

export function countScopeRedirects(messages: unknown[]) {
  return toPersistedUIChatMessages(messages, ["user", "assistant"]).filter(
    (message) =>
      message.role === "assistant" &&
      /let's stay focused on|we need to stay on the current objective/i.test(
        message.content,
      ),
  ).length;
}

export function sanitizeSampleMessages(messages: ChatMessage[]) {
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

export async function persistSampleRedirect(params: {
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

export function createSingleMessageStreamResponse(params: {
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

export function buildSampleSystemPrompt(params: {
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

export async function buildSampleModelMessages(
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

export function applySampleResponseHeaders(
  response: Response,
  params: {
    revision: number;
    leaseToken: string;
    conversationNumber: number;
    remainingSamples: number;
  },
) {
  response.headers.set("X-Remaining-Samples", String(params.remainingSamples));
  response.headers.set("X-Conversation-Number", String(params.conversationNumber));
  response.headers.set("X-Survey-Revision", String(params.revision));
  response.headers.set("X-Lease-Token", params.leaseToken);
}

export async function finalizePlannedSampleTurn(params: {
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

export async function persistSampleStreamResult(params: {
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
