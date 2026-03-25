import { eq } from "drizzle-orm";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { surveyConversations, surveys } from "@/db/schema";
import { generateAIResponse } from "@/lib/ai";
import {
  buildConductingSystemPrompt,
  createInitialSessionState,
  finalizeConductingTurn,
} from "@/lib/education/conducting-runtime";
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

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

function normalizeMessages(messages: any[]): ChatMessage[] {
  return messages
    .map((message) => {
      const content =
        typeof message.content === "string"
          ? message.content
          : Array.isArray(message.parts)
            ? message.parts
                .filter((part: any) => part.type === "text")
                .map((part: any) => part.text)
                .join("")
            : "";

      return {
        id: message.id,
        role: message.role,
        content,
        timestamp: message.timestamp || new Date().toISOString(),
      } as ChatMessage;
    })
    .filter((message) => message.role === "user" || message.role === "assistant");
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
    const body = (await request.json()) as {
      messages?: any[];
      conversationId?: string;
      language?: string;
    };

    const visibleMessages = normalizeMessages(Array.isArray(body.messages) ? body.messages : []);
    if (visibleMessages.length === 0) {
      return new Response("Invalid messages", { status: 400 });
    }

    const survey = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, surveyId))
      .then((rows) => rows[0]);
    if (!survey) return new Response("Survey not found", { status: 404 });
    if (survey.status !== "active") return new Response("Survey is not active", { status: 403 });
    if (survey.currentParticipants >= survey.participantLimit) {
      return new Response("Survey has reached participant limit", { status: 403 });
    }

    const [briefRow, planRow] = await Promise.all([
      getResearchBrief(survey.id),
      getActiveCoveragePlan(survey.id),
    ]);
    if (!briefRow || !planRow) {
      return new Response("This survey does not have an approved education brief yet.", { status: 400 });
    }

    let conversation = body.conversationId
      ? await getDb().select().from(surveyConversations).where(eq(surveyConversations.id, body.conversationId)).then((rows) => rows[0])
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
          originalLanguage: body.language || survey.language || "en",
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
        language: (body.language || survey.language || "en") as string,
        respondentId: conversation.participantId,
        initialState: createInitialSessionState({
          surveyId: survey.id,
          sessionId: nanoid(),
          sessionType: "live",
          language: (body.language || survey.language || "en") as any,
          coveragePlan: planRow.plan,
        }),
      });
    }

    const [activeLiveProfile, sampleFallbackProfile, runtimeLayers] = await Promise.all([
      getActiveConductingProfile(survey.id, "live"),
      getActiveConductingProfile(survey.id, "sample"),
      getConductingRuntimeLayers({
        surveyId: survey.id,
        organizationId: survey.organizationId,
        mode: "live",
      }),
    ]);
    const systemPrompt = buildConductingSystemPrompt({
      brief: briefRow.brief,
      coveragePlan: planRow.plan,
      sessionState: sessionRow.sessionState,
      sessionType: "live",
      conductingProfile: activeLiveProfile?.profile ?? sampleFallbackProfile?.profile ?? null,
      playbookContext: runtimeLayers.playbookContext,
      personalityContext: runtimeLayers.personalityContext,
    });

    const responseText = await generateAIResponse(
      visibleMessages.map((message) => `${message.role}: ${message.content}`).join("\n\n"),
      systemPrompt,
      { surveyId: survey.id, maxTokens: 550, temperature: 0.4 },
    );

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: responseText,
      timestamp: new Date().toISOString(),
    };
    const persistedMessages = [...visibleMessages, assistantMessage];

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
        console.error("[Chat Route] Failed to enqueue analytics refresh:", error);
      });
      await getDb()
        .update(surveyConversations)
        .set({ completed: finalState.status === "completed", updatedAt: new Date() })
        .where(eq(surveyConversations.id, conversation.id));
    }

    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: "text-delta", textDelta: responseText } as any);
        },
      }),
    });
    response.headers.set("X-Conversation-Id", conversation.id);
    response.headers.set("X-Conversation-Progress", Math.round(finalState.overallCoverage * 100).toString());
    response.headers.set("X-Conversation-State", finalState.currentNodeId || "wrap_up");
    response.headers.set("X-RateLimit-Limit", "20");
    response.headers.set("X-RateLimit-Remaining", rateLimitResult.remaining.toString());
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
    const body = (await request.json()) as {
      conversationId: string;
      messages: any[];
      completed?: boolean;
    };

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
      .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime());

    let durationMs = 0;
    let activeDurationMs = 0;
    const maxActiveGapMs = 2 * 60 * 1000;

    if (sortedMessages.length > 1) {
      durationMs =
        new Date(sortedMessages[sortedMessages.length - 1].timestamp!).getTime() -
        new Date(sortedMessages[0].timestamp!).getTime();

      for (let index = 1; index < sortedMessages.length; index += 1) {
        const previous = new Date(sortedMessages[index - 1].timestamp!).getTime();
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
