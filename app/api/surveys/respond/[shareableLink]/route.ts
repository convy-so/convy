import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { db } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";
import { ConversationManager } from "@/lib/conversation-manager";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import { selectModelForConversation, normalizeMessages } from "@/lib/ai";
import { getTimeBasedGreeting } from "@/lib/greetings";
import { ConductingSpecialist } from "@/lib/agents/conducting-specialist";
import type { AgentContext } from "@/lib/agents/types";
import { getRedisClient } from "@/lib/redis";
import { logUsage } from "@/lib/billing/logger";

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
            objective: (survey.expertState as any)?.objective,
            targetAudience: (survey.expertState as any)?.targetAudience,
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
        objective: (survey.expertState as any)?.objective,
        targetAudience: (survey.expertState as any)?.targetAudience,
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

    // AI SDK v6: Normalize UI messages to ModelMessages for proper handling
    const modelMessages = await normalizeMessages(messages);

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
      language: survey.language as "en" | "fr" | "de" | "es" | "it" | undefined,
      rollingContext,
    };
    const agent = new ConductingSpecialist(agentContext);
    await agent.initialize();
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
        const result = agent.stream(
          modelMessages,
          onMediaDisplay,
          async (params) => {
            const { text, usage, response } = params;

            // Log usage for survey response
            logUsage({
              surveyId: survey.id,
              type: "llm_text",
              provider: "google",
              modelName: (selectedModel as any).modelId ?? "gemini-2.5-flash",
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
          dynamicDirective,
        );

        // Iterate over fullStream to intercept tool calls
        let capturedMessageId = null;
        let streamedTextLength = 0;

        // State for streaming tool arguments
        let fullArgsBuffer = "";
        let isStreamingMessageToUser = false;
        let lastStreamedIndex = 0;

        for await (const chunk of result.fullStream) {
          switch (chunk.type) {
            case "text-delta":
              // If the model bypasses the tool and speaks text directly, stream it just in case
              writer.write({
                type: "text-delta",
                delta: chunk.text,
              } as any);
              break;

            case "tool-call-streaming-start" as any: {
              const part = chunk as { toolName?: string; toolCallId?: string };
              if (part.toolName === "think_and_respond" && part.toolCallId) {
                capturedMessageId = part.toolCallId;
                writer.write({
                  type: "message-annotations",
                  annotations: [{ type: "tool_start", id: part.toolCallId }],
                } as any);
              }
              break;
            }

            case "tool-call-delta" as any: {
              const part = chunk as { argsTextDelta?: string };
              if (part.argsTextDelta) {
                fullArgsBuffer += part.argsTextDelta;

                // Look for the start of message_to_user if we haven't found it yet
                if (!isStreamingMessageToUser) {
                  const marker = '"message_to_user": "';
                  const markerIndex = fullArgsBuffer.indexOf(marker);
                  if (markerIndex !== -1) {
                    isStreamingMessageToUser = true;
                    lastStreamedIndex = markerIndex + marker.length;
                  }
                }

                // If we are in streaming mode, extract and unescape new content
                if (isStreamingMessageToUser) {
                  // We look for the closing quote, but be careful of escaped quotes \"
                  let contentToProcess =
                    fullArgsBuffer.substring(lastStreamedIndex);

                  // Finding the true end of the string (unescaped quote)
                  let closingQuoteIndex = -1;
                  for (let i = 0; i < contentToProcess.length; i++) {
                    if (contentToProcess[i] === '"') {
                      // Check if it's escaped
                      let backslashes = 0;
                      for (
                        let j = i - 1;
                        j >= 0 && contentToProcess[j] === "\\";
                        j--
                      ) {
                        backslashes++;
                      }
                      if (backslashes % 2 === 0) {
                        closingQuoteIndex = i;
                        break;
                      }
                    }
                  }

                  let delta =
                    closingQuoteIndex !== -1
                      ? contentToProcess.substring(0, closingQuoteIndex)
                      : contentToProcess;

                  // If delta ends with a trailing backslash, hold it back to see if it's the start of an escape sequence
                  if (closingQuoteIndex === -1 && delta.endsWith("\\")) {
                    delta = delta.slice(0, -1);
                  }

                  if (delta.length > 0) {
                    try {
                      // Use JSON.parse to handle unescaping correctly
                      const unescapedDelta = JSON.parse(`"${delta}"`);
                      writer.write({
                        type: "text-delta",
                        delta: unescapedDelta,
                      } as any);
                      lastStreamedIndex += delta.length;
                    } catch (e) {
                      // If parsing fails (e.g. partial escape sequence), wait for more data
                    }
                  }

                  if (closingQuoteIndex !== -1) {
                    isStreamingMessageToUser = false; // Stop streaming once we hit the closing quote
                  }
                }
              }
              break;
            }

            case "tool-call": {
              if (
                "toolName" in chunk &&
                chunk.toolName === "think_and_respond"
              ) {
                // If we didn't stream it (e.g. key was at the very end), send it now
                if (!isStreamingMessageToUser && lastStreamedIndex === 0) {
                  try {
                    const payload = (chunk as any).args as any;
                    if (payload.message_to_user) {
                      writer.write({
                        type: "text-delta",
                        delta: payload.message_to_user,
                      } as any);
                    }
                  } catch (e) {
                    console.error("Failed to parse tool call args", e);
                  }
                }

                // Process state updates
                try {
                  const payload = (chunk as any).args as any;
                  if (
                    payload.state_updates &&
                    Object.keys(payload.state_updates).length > 0
                  ) {
                    console.log("[State Extracted]", payload.state_updates);
                  }
                } catch (e) {
                  // silent
                }
              }
              break;
            }

            case "tool-result":
              // We DO NOT write the tool-result to the UI stream
              break;

            case "finish":
              // Stream finished
              break;

            case "error":
              writer.write({
                type: "error",
                errorText: String(chunk.error),
              } as any);
              break;
          }
        }
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
