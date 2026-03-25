import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { getDb } from "@/db";
import { surveyConversations, surveys } from "@/db/schema";
import { getTimeBasedGreeting } from "@/lib/greetings";
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
import { enqueueConversationInsights } from "@/lib/queue";
import { getConductingRuntimeLayers } from "@/lib/education/runtime-context";

function normalizeMessages(messages: any[]) {
  return messages
    .map((message) => {
      const content = typeof message.content === "string"
        ? message.content
        : Array.isArray(message.parts)
          ? message.parts.filter((part: any) => part.type === "text").map((part: any) => part.text).join("")
          : "";
      return {
        id: message.id,
        role: message.role,
        content,
        timestamp: message.timestamp || new Date().toISOString(),
      };
    })
    .filter((message) => message.role === "user" || message.role === "assistant");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const { shareableLink } = await params;
    const { searchParams } = new URL(request.url);
    const existingConversationId = searchParams.get("conversationId");
    const languageParam = searchParams.get("language");
    const language = ["en", "fr", "de", "es", "it"].includes(languageParam || "")
      ? (languageParam as "en" | "fr" | "de" | "es" | "it")
      : undefined;

    const survey = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, shareableLink))
      .then((rows) => rows[0]);

    if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    if (survey.status !== "active") return NextResponse.json({ error: "Survey is not active" }, { status: 403 });

    if (existingConversationId) {
      const [existingConversation] = await getDb().select().from(surveyConversations).where(eq(surveyConversations.id, existingConversationId));
      if (existingConversation && existingConversation.surveyId === survey.id) {
        if (existingConversation.completed) {
          return NextResponse.json({ completed: true, survey: { title: survey.title, isVoice: survey.isVoice } });
        }
        return NextResponse.json({
          survey: {
            id: survey.id,
            title: survey.title,
            objective: survey.coreObjective,
            tone: survey.tone,
            requiredQuestions: survey.requiredQuestions || [],
            isVoice: survey.isVoice,
            media: survey.media,
            programId: survey.programId,
          },
          conversationId: existingConversation.id,
          participantId: existingConversation.participantId,
          messages: existingConversation.rawConversation || [],
        });
      }
    }

    if (survey.currentParticipants >= survey.participantLimit) {
      return NextResponse.json({ error: "Survey has reached its participant limit" }, { status: 403 });
    }

    const conversationId = nanoid();
    const participantId = nanoid(8);
    const greetingMessage = {
      id: nanoid(),
      role: "assistant" as const,
      content: getTimeBasedGreeting("response", language || survey.language || "en"),
      timestamp: new Date().toISOString(),
    };

    await getDb().insert(surveyConversations).values({
      id: conversationId,
      surveyId: survey.id,
      participantId,
      rawConversation: [greetingMessage],
      completed: false,
      originalLanguage: language || survey.language || "en",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await getDb().update(surveys).set({ currentParticipants: survey.currentParticipants + 1, updatedAt: new Date() }).where(eq(surveys.id, survey.id));

    return NextResponse.json({
      survey: {
        id: survey.id,
        title: survey.title,
        objective: survey.coreObjective,
        tone: survey.tone,
        requiredQuestions: survey.requiredQuestions || [],
        isVoice: survey.isVoice,
        media: survey.media,
        programId: survey.programId,
      },
      conversationId,
      participantId,
      messages: [greetingMessage],
    });
  } catch (error) {
    console.error("Error initializing survey response:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const body = await req.json();
    const { messages, context, language } = body as { messages: any[]; context?: any; language?: string };
    const { shareableLink } = await params;

    const [survey] = await getDb().select().from(surveys).where(eq(surveys.shareableLink, shareableLink)).limit(1);
    if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    if (survey.status !== "active") return NextResponse.json({ error: "Survey is not active" }, { status: 403 });

    const conversationId = context?.conversationId || body.conversationId;
    if (!conversationId) return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 });

    const [conversation, briefRow, planRow] = await Promise.all([
      getDb().select().from(surveyConversations).where(eq(surveyConversations.id, conversationId)).then((rows) => rows[0]),
      getResearchBrief(survey.id),
      getActiveCoveragePlan(survey.id),
    ]);
    if (!conversation || conversation.surveyId !== survey.id) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (!briefRow || !planRow) {
      return NextResponse.json({ error: "This survey does not have an approved education brief yet." }, { status: 400 });
    }

    let sessionRow = await getSessionBySourceId(conversation.id);
    if (!sessionRow) {
      sessionRow = await ensureSession({
        surveyId: survey.id,
        sessionType: "live",
        sourceConversationId: conversation.id,
        language: (language || survey.language || "en") as string,
        respondentId: conversation.participantId,
        initialState: createInitialSessionState({
          surveyId: survey.id,
          sessionId: nanoid(),
          sessionType: "live",
          language: (language || survey.language || "en") as any,
          coveragePlan: planRow.plan,
        }),
      });
    }

    const visibleMessages = normalizeMessages(Array.isArray(messages) ? messages : []);
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

    const promptMessages = visibleMessages.length > 0
      ? visibleMessages
      : [{ role: "user", content: "Start the interview by greeting the participant and asking the first best question." }];

    const responseText = await generateAIResponse(
      promptMessages.map((message) => `${message.role}: ${message.content}`).join("\n\n"),
      systemPrompt,
      { surveyId: survey.id, maxTokens: 550, temperature: 0.4 },
    );

    const assistantMessage = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: responseText,
      timestamp: new Date().toISOString(),
    };
    const persistedMessages = visibleMessages.length > 0 ? [...visibleMessages, assistantMessage] : [assistantMessage];

    await getDb()
      .update(surveyConversations)
      .set({
        rawConversation: persistedMessages,
        completed: sessionRow.sessionState.status === "completed",
        updatedAt: new Date(),
      })
      .where(eq(surveyConversations.id, conversation.id));

    if (visibleMessages.some((message) => message.role === "user")) {
      const { nextState } = await finalizeConductingTurn({
        surveyId: survey.id,
        sessionId: sessionRow.id,
        brief: briefRow.brief,
        coveragePlan: planRow.plan,
        sessionState: sessionRow.sessionState,
        messages: persistedMessages,
      });
      await enqueueConversationInsights({
        conversationId: conversation.id,
        surveyId: survey.id,
        userId: survey.userId,
      }).catch((error) => {
        console.error("[Respond Route] Failed to enqueue analytics refresh:", error);
      });
      await getDb()
        .update(surveyConversations)
        .set({ completed: nextState.status === "completed", updatedAt: new Date() })
        .where(eq(surveyConversations.id, conversation.id));
    }

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: "text-delta", textDelta: responseText } as any);
        },
      }),
    });
  } catch (error) {
    console.error("[Respond Route] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
