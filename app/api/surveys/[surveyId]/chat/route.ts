import { eq } from "drizzle-orm";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { surveyConversations, surveys } from "@/db/schema";
import { generateAIResponse } from "@/lib/ai";
import {
  buildConductingSystemPromptParts,
  createInitialSessionState,
  finalizeConductingTurn,
} from "@/lib/education/conducting-runtime";
import { toPersistedUIChatMessages } from "@/lib/chat-ui-messages";
import {
  ensureSession,
  getActiveConductingProfile,
  getActiveCoveragePlan,
  getResearchBrief,
  getSessionBySourceId,
} from "@/lib/education/storage";
import { chatRateLimiter, getClientIP } from "@/lib/ratelimit";
import { enqueueConversationInsights } from "@/lib/queue";
import { getConductingRuntimeLayers } from "@/lib/education/runtime-context";
import { type ChatMessage } from "@/lib/chat-types";

type ConductingLanguage = "en" | "fr" | "de" | "es" | "it";
type ChatRouteBody = {
  messages?: unknown[];
  conversationId?: string;
  language?: unknown;
};

type ChatUpdateBody = {
  conversationId?: string;
  messages?: unknown[];
  completed?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseChatRouteBody(value: unknown): ChatRouteBody {
  if (!isRecord(value)) {
    return {};
  }

  return {
    messages: Array.isArray(value.messages) ? value.messages : undefined,
    conversationId:
      typeof value.conversationId === "string" ? value.conversationId : undefined,
    language: value.language,
  };
}

function parseChatUpdateBody(value: unknown): ChatUpdateBody {
  if (!isRecord(value)) {
    return {};
  }

  return {
    conversationId:
      typeof value.conversationId === "string" ? value.conversationId : undefined,
    messages: Array.isArray(value.messages) ? value.messages : undefined,
    completed: typeof value.completed === "boolean" ? value.completed : undefined,
  };
}

function getConductingLanguage(value: unknown): ConductingLanguage {
  return (
    value === "en" ||
    value === "fr" ||
    value === "de" ||
    value === "es" ||
    value === "it"
  )
    ? value
    : "en";
}

function normalizeMessages(messages: unknown[]): ChatMessage[] {
  return toPersistedUIChatMessages(messages, ["user", "assistant"]).map(
    (message) => ({
      id: message.id || nanoid(),
      role: message.role,
      content: message.content,
      parts: message.parts,
      timestamp: message.timestamp || new Date().toISOString(),
    }),
  );
}

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const clientIP = getClientIP(request);
    const rateLimitResult = await chatRateLimiter.limit(clientIP);
    if (!rateLimitResult.success) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAfter: rateLimitResult.reset,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { surveyId } = await params;
    const body = parseChatRouteBody(await request.json());

    const visibleMessages = normalizeMessages(
      Array.isArray(body.messages) ? body.messages : [],
    );
    if (visibleMessages.length === 0) {
      return new Response("Invalid messages", { status: 400 });
    }

    const survey = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, surveyId))
      .then((rows) => rows[0]);
    if (!survey) return new Response("Survey not found", { status: 404 });
    if (survey.status !== "active")
      return new Response("Survey is not active", { status: 403 });
    if (survey.currentParticipants >= survey.participantLimit) {
      return new Response("Survey has reached participant limit", {
        status: 403,
      });
    }

    const [briefRow, planRow] = await Promise.all([
      getResearchBrief(survey.id),
      getActiveCoveragePlan(survey.id),
    ]);
    if (!briefRow || !planRow) {
      return new Response(
        "This survey does not have an approved education brief yet.",
        { status: 400 },
      );
    }

    let conversation = body.conversationId
      ? await getDb()
          .select()
          .from(surveyConversations)
          .where(eq(surveyConversations.id, body.conversationId))
          .then((rows) => rows[0])
      : null;

    if (!conversation) {
      const conversationId = nanoid();
      const [created] = await getDb()
        .insert(surveyConversations)
        .values({
          id: conversationId,
          surveyId: survey.id,
          participantId: nanoid(8),
          rawConversation: [],
          completed: false,
          originalLanguage: getConductingLanguage(body.language ?? survey.language),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      conversation = created;
      await getDb()
        .update(surveys)
        .set({
          currentParticipants: survey.currentParticipants + 1,
          updatedAt: new Date(),
        })
        .where(eq(surveys.id, survey.id));
    } else if (conversation.surveyId !== survey.id) {
      return new Response("Conversation not found", { status: 404 });
    }

    let sessionRow = await getSessionBySourceId(conversation.id);
    if (!sessionRow) {
      sessionRow = await ensureSession({
        surveyId: survey.id,
        sessionType: "live",
        sourceConversationId: conversation.id,
        language: getConductingLanguage(body.language ?? survey.language),
        respondentId: conversation.participantId,
        initialState: createInitialSessionState({
          surveyId: survey.id,
          sessionId: nanoid(),
          sessionType: "live",
          language: getConductingLanguage(body.language ?? survey.language),
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
    });
    const responseText = await generateAIResponse(
      visibleMessages
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n\n"),
      promptParts.dynamicSystemPrompt,
      {
        surveyId: survey.id,
        maxTokens: 550,
        temperature: 0.4,
        promptCache: {
          namespace: "conducting-live",
          staticSystemPrompt: promptParts.staticSystemPrompt,
        },
      },
    );

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: responseText,
      timestamp: new Date().toISOString(),
    };
    const persistedMessages = [
      ...visibleMessages,
      assistantMessage,
    ].map((msg) => ({
      id: msg.id || crypto.randomUUID(),
      role: msg.role,
      content: msg.content,
      parts: msg.parts,
      timestamp: msg.timestamp || new Date().toISOString(),
    }));

    await getDb()
      .update(surveyConversations)
      .set({
        rawConversation: persistedMessages,
        updatedAt: new Date(),
      })
      .where(eq(surveyConversations.id, conversation.id));

    let finalState = sessionRow.sessionState;
    if (visibleMessages.some((message) => message.role === "user")) {
      const result = await finalizeConductingTurn({
        surveyId: survey.id,
        sessionId: sessionRow.id,
        brief: briefRow.brief,
        coveragePlan: planRow.plan,
        sessionState: sessionRow.sessionState,
        messages: persistedMessages,
      });
      finalState = result.nextState;
      await enqueueConversationInsights({
        conversationId: conversation.id,
        surveyId: survey.id,
        userId: survey.userId,
      }).catch((error) => {
        console.error(
          "[Chat Route] Failed to enqueue analytics refresh:",
          error,
        );
      });
      await getDb()
        .update(surveyConversations)
        .set({
          completed: finalState.status === "completed",
          updatedAt: new Date(),
        })
        .where(eq(surveyConversations.id, conversation.id));
    }

    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: "text-delta", delta: responseText, id: assistantMessage.id });
        },
      }),
    });
    response.headers.set("X-Conversation-Id", conversation.id);
    response.headers.set(
      "X-Conversation-Progress",
      Math.round(finalState.overallCoverage * 100).toString(),
    );
    response.headers.set(
      "X-Conversation-State",
      finalState.currentNodeId || "wrap_up",
    );
    response.headers.set("X-RateLimit-Limit", "20");
    response.headers.set(
      "X-RateLimit-Remaining",
      rateLimitResult.remaining.toString(),
    );
    response.headers.set("X-RateLimit-Reset", rateLimitResult.reset.toString());
    return response;
  } catch (error) {
    console.error("[Chat Route] Error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const { surveyId } = await params;
    const body = parseChatUpdateBody(await request.json());

    if (!body.conversationId || !Array.isArray(body.messages)) {
      return new Response("Invalid request", { status: 400 });
    }

    const survey = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, surveyId))
      .then((rows) => rows[0]);
    if (!survey) return new Response("Survey not found", { status: 404 });

    const messages = normalizeMessages(body.messages);
    const sortedMessages = messages
      .filter((message) => message.timestamp)
      .sort(
        (a, b) =>
          new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime(),
      );

    let durationMs = 0;
    let activeDurationMs = 0;
    const maxActiveGapMs = 2 * 60 * 1000;

    if (sortedMessages.length > 1) {
      durationMs =
        new Date(
          sortedMessages[sortedMessages.length - 1].timestamp!,
        ).getTime() - new Date(sortedMessages[0].timestamp!).getTime();

      for (let index = 1; index < sortedMessages.length; index += 1) {
        const previous = new Date(
          sortedMessages[index - 1].timestamp!,
        ).getTime();
        const current = new Date(sortedMessages[index].timestamp!).getTime();
        const gap = current - previous;
        if (gap > 0) activeDurationMs += Math.min(gap, maxActiveGapMs);
      }
    }

    await getDb()
      .update(surveyConversations)
      .set({
        rawConversation: messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          timestamp: message.timestamp || new Date().toISOString(),
        })),
        completed: body.completed ?? false,
        durationMs,
        activeDurationMs,
        updatedAt: new Date(),
      })
      .where(eq(surveyConversations.id, body.conversationId));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Chat Route] PUT error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
