import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import {
  streamText,
  convertToModelMessages,
  type UIMessage,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";

import { db } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";
import { ConversationManager } from "@/lib/conversation-manager";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import {
  selectModelForConversation,
  flashModel,
  flashLiteModel,
} from "@/lib/ai";
import { getTimeBasedGreeting } from "@/lib/greetings";
import { ConductingSpecialist } from "@/lib/agents/conducting-specialist";
import type { AgentContext } from "@/lib/agents/types";
import { getRedisClient } from "@/lib/redis";

/**
 * GET - Initialize a survey response conversation and generate AI greeting
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const { shareableLink } = await params;
    const { searchParams } = new URL(request.url);
    const existingConversationId = searchParams.get("conversationId");
    const languageParam = searchParams.get("language");
    const language = ["en", "fr", "de", "es", "it"].includes(
      languageParam || "",
    )
      ? (languageParam as any)
      : undefined;

    // Get survey by shareable link (fetch full record for config building)
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, shareableLink));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    if (survey.status !== "active") {
      return NextResponse.json(
        { error: "Survey is not active" },
        { status: 403 },
      );
    }

    // Handle resumption if conversationId is provided
    if (existingConversationId) {
      const [existingConversation] = await db
        .select()
        .from(surveyConversations)
        .where(eq(surveyConversations.id, existingConversationId));

      if (existingConversation && existingConversation.surveyId === survey.id) {
        // If already completed, signal client
        if (existingConversation.completed) {
          return NextResponse.json({
            completed: true,
            survey: {
              title: survey.title,
              isVoice: survey.isVoice,
            },
          });
        }

        // If incomplete, resume
        return NextResponse.json({
          survey: {
            id: survey.id,
            title: survey.title,
            objective: survey.objective,
            targetAudience: survey.targetAudience,
            tone: survey.tone,
            requiredQuestions: survey.requiredQuestions || [],
            isVoice: survey.isVoice,
            media: survey.media,
          },
          conversationId: existingConversation.id,
          participantId: existingConversation.participantId,
          messages: existingConversation.rawConversation || [], // Resume history
        });
      }
    }

    if (survey.currentParticipants >= survey.participantLimit) {
      return NextResponse.json(
        { error: "Survey has reached its participant limit" },
        { status: 403 },
      );
    }

    // Create new conversation record
    const conversationId = nanoid();
    const participantId = nanoid(8);

    // Generate initial greeting message
    const greetingMessage = {
      id: nanoid(),
      role: "assistant" as const,
      content: getTimeBasedGreeting(
        "response",
        language || survey.language || "en",
      ),
      timestamp: new Date().toISOString(),
    };

    // Create new conversation record with greeting
    await db.insert(surveyConversations).values({
      id: conversationId,
      surveyId: survey.id,
      participantId,
      rawConversation: [greetingMessage],
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      survey: {
        id: survey.id,
        title: survey.title,
        objective: survey.objective,
        targetAudience: survey.targetAudience,
        tone: survey.tone,
        requiredQuestions: survey.requiredQuestions || [],
        isVoice: survey.isVoice,
        media: survey.media,
      },
      conversationId,
      participantId,
      messages: [greetingMessage],
    });
  } catch (error) {
    console.error("Error initializing survey response:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

import {
  createUIMessageFilter,
  stripScratchpadFromText,
} from "@/lib/agents/scratchpad-filter";

/**
 * POST - Handle survey conversation messages
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const body = await req.json();
    const { messages, context, language } = body;
    const { shareableLink } = await params;

    // Fetch survey by shareable link
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, shareableLink))
      .limit(1);

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const conversationId = context?.conversationId || body.conversationId;

    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID is required" },
        { status: 400 },
      );
    }

    // Check if survey is active (unless resuming an existing valid conversation)
    if (survey.status !== "active") {
      return NextResponse.json(
        { error: "Survey is not active" },
        { status: 403 },
      );
    }

    // Prepare survey config
    const surveyConfig = buildCompleteSurveyConfig(survey);

    // AI SDK v6: Convert UIMessages to ModelMessages for proper handling
    const modelMessages = await convertToModelMessages(messages as UIMessage[]);

    // Load conversation context (handling hydration, compression, signals)
    const rollingContext = await ConversationManager.loadOrCreateContext(
      conversationId,
      modelMessages,
      surveyConfig,
    );

    // ── Build system prompt via ConductingSpecialist ────────────────────
    const agentContext: AgentContext = {
      conversationId,
      surveyConfig,
      language,
      rollingContext,
    };
    const agent = new ConductingSpecialist(agentContext);
    await Promise.all([
      agent.preloadSkills(),
      agent.preloadPatternLearnings(
        ["questioning", "probing", "engagement"],
        2,
      ),
    ]).catch((err) =>
      console.warn("[Respond Route] Agent preload warning:", err),
    );
    const systemPrompt = agent.buildSystemPrompt();

    // ── Redis attribution: log which pattern was injected this turn ──────
    if (agentContext.situationalPattern) {
      try {
        const redis = getRedisClient();
        await redis.set(
          `pattern_attribution:${conversationId}`,
          JSON.stringify({
            patternId: agentContext.situationalPattern.id,
            experimentId: agentContext.situationalPattern.experimentId ?? null,
            variant: agentContext.situationalPattern.experimentVariant ?? null,
            source: agentContext.situationalPattern.source,
            turnIndex: modelMessages.length,
          }),
          "EX",
          3600,
        );
      } catch (redisErr) {
        console.warn(
          "[Respond Route] Pattern attribution write failed:",
          redisErr,
        );
      }
    }

    // Define tools
    const tools = ConversationManager.getTools(surveyConfig);

    // Intelligent model selection
    const userMessages = modelMessages.filter((m: any) => m.role === "user");
    const minQuestions = Math.max(
      (survey.requiredQuestions as any[])?.length || 0,
      3,
    );
    const hasMedia = (survey.media as any[])?.length > 0;
    const selectedModel = selectModelForConversation(
      rollingContext,
      userMessages.length,
      minQuestions,
      hasMedia,
    );

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Stream the AI response with scratchpad filtering
        const result = streamText({
          model: selectedModel,
          system: systemPrompt,
          messages: modelMessages,
          tools,
          toolChoice: "auto",
          stopWhen: stepCountIs(5),
          temperature: 0.7,
          maxOutputTokens: 2000, // Increased to accommodate scratchpad + response
          onFinish: async ({ text, toolCalls, toolResults, steps }) => {
            // Clean the final text for storage
            const cleanText = stripScratchpadFromText(text);

            // Save conversation to database
            const assistantMessage = steps[
              steps.length - 1
            ]?.response?.messages?.find((m) => m.role === "assistant");

            const updatedMessages = [
              ...modelMessages,
              {
                role: "assistant" as const,
                content: cleanText,
                parts:
                  (assistantMessage as any)?.content &&
                  Array.isArray((assistantMessage as any).content)
                    ? (assistantMessage as any).content
                    : undefined,
                timestamp: new Date().toISOString(),
              },
            ];

            // Update memory in background (learning)
            ConversationManager.updateMemoryAsync(
              conversationId,
              updatedMessages,
              surveyConfig,
              rollingContext,
            ).catch((err) =>
              console.error("Background memory update failed:", err),
            );

            // Check for survey completion
            const finishSurveyCall =
              steps
                .flatMap((step) => step.toolCalls)
                .find((call) => call.toolName === "finishSurvey") ||
              toolCalls?.find((call: any) => call.toolName === "finishSurvey");

            const isCompletionPhrase =
              cleanText.toLowerCase().includes("thank you for completing") ||
              cleanText.toLowerCase().includes("survey is now complete");

            const isCompleted =
              (!!finishSurveyCall || isCompletionPhrase) &&
              userMessages.length >= minQuestions;

            if (conversationId) {
              const dbMessages = updatedMessages.map((m: any) => ({
                role: m.role,
                content: m.content,
                parts: m.parts,
                timestamp: m.timestamp || new Date().toISOString(),
              }));

              await db
                .update(surveyConversations)
                .set({
                  rawConversation: dbMessages,
                  completed: isCompleted,
                  updatedAt: new Date(),
                })
                .where(eq(surveyConversations.id, conversationId));
            }

            if (isCompleted) {
              await db
                .update(surveys)
                .set({
                  currentParticipants: (survey.currentParticipants || 0) + 1,
                  updatedAt: new Date(),
                })
                .where(eq(surveys.id, survey.id));

              try {
                const { enqueueConversationInsights } =
                  await import("@/lib/queue");
                await enqueueConversationInsights({
                  conversationId,
                  surveyId: survey.id,
                  userId: survey.userId,
                });
              } catch (error) {
                console.error("[HTTP Chat] Failed to enqueue insights:", error);
              }

              writer.write({
                type: "data",
                data: { isCompleted: true },
              } as any);
            }
          },
        });

        // Apply the UI Message Filter to strip <scratchpad> blocks from the stream
        writer.merge(
          result.toUIMessageStream().pipeThrough(createUIMessageFilter()),
        );
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("Error in survey response:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
