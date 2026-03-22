import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { getDb } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";
import { ConversationManager } from "@/lib/conversation-manager";
import { MemoryBridge, TranscriptTurn } from "@/lib/memory-bridge";
import { ExpertStateStore } from "@/lib/expert-state-store";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import { defaultModel, normalizeMessages } from "@/lib/ai";
import { getTimeBasedGreeting } from "@/lib/greetings";
import { ConductingSpecialist } from "@/lib/agents/conducting-specialist";
import type { AgentContext } from "@/lib/agents/types";
import { getRedisClient } from "@/lib/redis";
import { logUsage } from "@/lib/billing/logger";
import { TurnGateManager } from "@/lib/agents/streaming/turn-gate";
import { StreamFieldExtractor } from "@/lib/agents/streaming/stream-field-extractor";
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
    await getDb()
      .insert(surveyConversations)
      .values({
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
    /*
    console.log(
      `[RespondAPI:POST] Normalized messages: ${modelMessages.length}. Last role: ${modelMessages[modelMessages.length - 1]?.role}`,
    );
    */

    // Load conversation context (handling hydration, compression, signals)
    const memoryBridge = await ConversationManager.loadOrCreateMemoryBridge(conversationId);
    // console.log(`[RespondAPI:POST] Context loaded.`);

    // ── Pre-Turn: Await any pending background updates from last turn ──────
    await TurnGateManager.awaitTurn(conversationId);
    
    const expertState = await ExpertStateStore.get(survey.id);

    // ── Build system prompt via ConductingSpecialist ────────────────────
    const agentContext: AgentContext = {
      conversationId,
      surveyConfig,
      language: (language || survey.language) as
        | "en"
        | "fr"
        | "de"
        | "es"
        | "it"
        | undefined,
      memoryBridge,
      expertState: expertState || undefined,
      modality: "text",
      subjectIntelligence: surveyConfig.subjectIntelligence,
    };
    const agent = new ConductingSpecialist(agentContext);
    // console.log(`[RespondAPI:POST] Initializing agent...`);
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
    // console.log(`[RespondAPI:POST] Agent initialized. Building prompt...`);
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
        // console.log(`[RespondAPI:Stream] Starting agent.stream() call...`);
        const result = await withGeminiLimit(async () => {
          return agent.stream(
            modelMessages,
            onMediaDisplay,
            async (params) => {
              const { text, usage, response } = params;
              /*
              console.log(
                `[RespondAPI:Stream] onFinish triggered. Text length: ${text?.length}. Tool calls: ${response.messages?.find((m: any) => m.role === "assistant")?.toolInvocations?.length || 0}`,
              );
              */

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

              // Update memory in background (learning) and register with TurnGate
              let bgUpdatePromise = Promise.resolve();
              if (expertState) {
                const newTurn: TranscriptTurn = {
                  turnIndex: expertState.transcript.turns.filter((t: any) => t.type !== "summary_block").length + 1,
                  speaker: "agent",
                  text: cleanText || "",
                  timestamp: new Date().toISOString(),
                  type: "turn"
                };
                
                const respondentMsg = modelMessages[modelMessages.length - 1];
                if (respondentMsg && respondentMsg.role === "user") {
                   const resTurn: TranscriptTurn = {
                     turnIndex: expertState.transcript.turns.filter((t: any) => t.type !== "summary_block").length + 1,
                     speaker: "respondent",
                     text: typeof respondentMsg.content === 'string' ? respondentMsg.content : (Array.isArray(respondentMsg.content) ? (respondentMsg.content.find((p:any) => p.type === 'text') as any)?.text || "" : ""),
                     timestamp: new Date().toISOString(),
                     type: "turn"
                   };
                   newTurn.turnIndex = resTurn.turnIndex + 1;
                   expertState.transcript.turns.push(resTurn);
                }
                expertState.transcript.turns.push(newTurn);
                ExpertStateStore.update(survey.id, expertState).catch(console.error);

                bgUpdatePromise = ConversationManager.updateMemoryAsync(
                  conversationId,
                  surveyConfig,
                  expertState,
                  memoryBridge,
                  newTurn,
                  { userId: survey.userId, organizationId: survey.organizationId || undefined }
                ).catch((err) =>
                  console.error("Background memory update failed:", err),
                );
              }
              
              TurnGateManager.registerTurn(conversationId, bgUpdatePromise);

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
                const dbMessages = updatedMessages.map((m: any) => {
                  let contentStr = m.content;
                  let partsArr = m.parts;

                  // If content is an array (AI SDK ModelMessage), extract the string and map the parts
                  if (Array.isArray(m.content)) {
                    partsArr = m.content;
                    contentStr =
                      m.content.find((p: any) => p.type === "text")?.text || "";
                  }

                  return {
                    role: m.role,
                    content: contentStr,
                    parts: partsArr,
                    timestamp: m.timestamp || new Date().toISOString(),
                  };
                });

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
        const uiStream = result.toUIMessageStream();
        
        // Custom StreamFieldExtractor to drop "reasoning" JSON overhead and stream only "response"
        const extractor = new StreamFieldExtractor({
          onSafetyGateTripped: (reason) => {
            console.error(`[RespondAPI:SafetyGate] ${reason}`);
          }
        });

        for await (const chunk of uiStream) {
          const chunkObj = chunk as any;
          
          if (chunkObj.type === "text-delta") {
            const cleanText = extractor.processChunk(chunkObj.textDelta || chunkObj.delta);
            if (cleanText) {
              writer.write({ type: "text-delta", textDelta: cleanText } as any);
            }
          } else {
            // Passthrough non-text chunks (e.g. tools, errors, start-step)
            writer.write(chunkObj);
          }
        }
        
        // Flush final extracted text
        const finalCleanText = extractor.flush();
        if (finalCleanText) {
           writer.write({ type: "text-delta", textDelta: finalCleanText } as any);
        }

        // console.log(`[RespondAPI:Stream] Stream loop finished.`);
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
