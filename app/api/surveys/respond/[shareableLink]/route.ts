import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { getDb } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";
import { ConversationManager } from "@/lib/conversation-manager";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import { defaultModel, normalizeMessages } from "@/lib/ai";
import { getTimeBasedGreeting } from "@/lib/greetings";
import { ConductingSpecialist } from "@/lib/agents/conducting-specialist";
import type { AgentContext } from "@/lib/agents/types";
import { getRedisClient } from "@/lib/redis";
import { logUsage } from "@/lib/billing/logger";
import {
  withGeminiLimit,
  GeminiCapacityError,
  geminiCapacityResponse,
} from "@/lib/gemini-limiter";

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
      ? (languageParam as "en" | "fr" | "de" | "es" | "it")
      : undefined;

    // Get survey by shareable link (fetch full record for config building)
    const [survey] = await getDb()
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
      const [existingConversation] = await getDb()
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
            objective: (survey.expertState as Record<string, any>)?.objective,
            targetAudience: (survey.expertState as Record<string, any>)
              ?.targetAudience,
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
    await getDb().insert(surveyConversations).values({
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
        objective: (survey.expertState as Record<string, any>)?.objective,
        targetAudience: (survey.expertState as Record<string, any>)
          ?.targetAudience,
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

/**
 * POST - Handle survey conversation messages
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const body = await req.json();
    const { messages, context, language } = body as {
      messages: any[];
      context?: any;
      language?: string;
    };
    const { shareableLink } = await params;

    // Fetch survey by shareable link
    const [survey] = await getDb()
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

    // AI SDK v6: Normalize UI messages to ModelMessages for proper handling
    const modelMessages = await normalizeMessages(messages);
    console.log(
      `[RespondAPI:POST] Normalized messages: ${modelMessages.length}. Last role: ${modelMessages[modelMessages.length - 1]?.role}`,
    );

    // Load conversation context (handling hydration, compression, signals)
    const rollingContext = await ConversationManager.loadOrCreateContext(
      conversationId,
      modelMessages,
      surveyConfig,
    );
    console.log(
      `[RespondAPI:POST] Context loaded. State: ${rollingContext.stateContext.currentState}. Topics: ${rollingContext.memory.topicsCovered.length}`,
    );

    // ── Build system prompt via ConductingSpecialist ────────────────────
    const agentContext: AgentContext = {
      conversationId,
      surveyConfig,
      language: survey.language as "en" | "fr" | "de" | "es" | "it" | undefined,
      rollingContext,
    };
    const agent = new ConductingSpecialist(agentContext);
    console.log(`[RespondAPI:POST] Initializing agent...`);
    await agent.initialize();
    await Promise.all([
      agent.preloadSkills(),
      agent.preloadPatternLearnings(
        ["questioning", "probing", "engagement"],
        2,
      ),
    ]).catch((err) =>
      console.warn("[RespondAPI:POST] Agent preload warning:", err),
    );
    console.log(`[RespondAPI:POST] Agent initialized. Building prompt...`);
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

    // Intelligent model selection
    const userMessages = modelMessages.filter((m) => m.role === "user");
    const minQuestions = Math.max(
      (survey.requiredQuestions as unknown[])?.length || 0,
      3,
    );

    // Dynamic Resume Logic
    let dynamicDirective = undefined;
    if (modelMessages.length > 0) {
      const lastMessage = modelMessages[modelMessages.length - 1];
      if (lastMessage.role === "user") {
        dynamicDirective =
          "The participant has returned to this survey after a pause. The last message in the history is exactly what they said before they left or just now upon returning. Respond directly to their last input and continue the interview naturally.";
      }
    }

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const onMediaDisplay = (media: any) => {
          writer.write({
            type: "data",
            data: { media },
          } as any);
        };

        // Stream the AI response with scratchpad filtering via agent.stream()
        console.log(`[RespondAPI:Stream] Starting agent.stream() call...`);
        const result = await withGeminiLimit(async () => {
          return agent.stream(
            modelMessages,
            onMediaDisplay,
            async (params) => {
              const { text, usage, response } = params;
              console.log(
                `[RespondAPI:Stream] onFinish triggered. Text length: ${text?.length}. Tool calls: ${response.messages?.find((m: any) => m.role === "assistant")?.toolInvocations?.length || 0}`,
              );

              // Log usage for survey response
              logUsage({
                surveyId: survey.id,
                type: "llm_text",
                provider: (
                  defaultModel as { modelId?: string }
                ).modelId?.includes("gpt")
                  ? "openai"
                  : "google",
                modelName:
                  (defaultModel as { modelId?: string }).modelId ??
                  "gpt-4.1-mini",
                promptTokens: usage.inputTokens,
                completionTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
              });

              // Under Unified Tools, text is just text now
              const cleanText = text;

              // Save conversation to database
              const assistantMessage = response.messages?.find(
                (m: any) => m.role === "assistant",
              );

              const updatedMessages = [
                ...modelMessages,
                {
                  role: "assistant" as const,
                  content: cleanText,
                  parts:
                    assistantMessage?.content &&
                    Array.isArray(assistantMessage.content)
                      ? assistantMessage.content
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
              const toolInvocations = assistantMessage?.toolInvocations || [];
              const finishSurveyCall = toolInvocations.find(
                (call: any) => call.toolName === "finishSurvey",
              );

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

                const [currentConv] = await getDb()
                  .select({
                    rawConversation: surveyConversations.rawConversation,
                  })
                  .from(surveyConversations)
                  .where(eq(surveyConversations.id, conversationId));

                const prevMessages =
                  (currentConv?.rawConversation as any[]) || [];
                const prevUserMessages = prevMessages.filter(
                  (m) => m.role === "user",
                );

                // Increment participant count ONLY on the very first user message (participation)
                if (prevUserMessages.length === 0 && userMessages.length > 0) {
                  await getDb()
                    .update(surveys)
                    .set({
                      currentParticipants:
                        (survey.currentParticipants || 0) + 1,
                      updatedAt: new Date(),
                    })
                    .where(eq(surveys.id, survey.id));
                }

                await getDb()
                  .update(surveyConversations)
                  .set({
                    rawConversation: dbMessages,
                    completed: isCompleted,
                    updatedAt: new Date(),
                  })
                  .where(eq(surveyConversations.id, conversationId));
              }

              if (isCompleted) {
                try {
                  const {
                    enqueueConversationInsights,
                    enqueueGenerativeSummary,
                  } = await import("@/lib/queue");
                  await enqueueConversationInsights({
                    conversationId,
                    surveyId: survey.id,
                    userId: survey.userId,
                  });
                  // Debounced: 2-min delay, 15-min max-wait, deduplication per surveyId
                  await enqueueGenerativeSummary({
                    surveyId: survey.id,
                    userId: survey.userId,
                  });
                } catch (error) {
                  console.error(
                    "[HTTP Chat] Failed to enqueue insights:",
                    error,
                  );
                }

                writer.write({
                  type: "data",
                  data: { isCompleted: true },
                } as any);
              }
            },
            dynamicDirective,
          );
        });

        // AI SDK v6: Stream the results correctly using protocol translation.
        // This converts raw TextStreamParts into UIMessageChunks, stripping
        // problematic metadata (like request/warnings in 'start-step').
        const uiStream = result.toUIMessageStream();

        for await (const chunk of uiStream) {
          const chunkType = (chunk as { type: string }).type;
          console.log(`[RespondAPI:StreamPart] Chunk type: ${chunkType}`);

          // Passthrough sanitized chunks.
          writer.write(chunk as any);
        }
        console.log(`[RespondAPI:Stream] Stream loop finished.`);
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (error instanceof GeminiCapacityError) {
      return geminiCapacityResponse();
    }
    console.error("Error in survey response:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
