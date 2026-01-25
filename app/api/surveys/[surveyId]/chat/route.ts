import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { streamText, tool, generateText, Output, stepCountIs } from "ai";
import { z } from "zod";

import { db } from "@/db";
import { surveyConversations, surveys } from "@/db/schema";
import { defaultModel, analysisModel} from "@/lib/ai";
import {
  getSurveyConversationSystemPrompt,
  type SurveyConfig,
} from "@/lib/prompts";
import { chatRateLimiter, getClientIP } from "@/lib/ratelimit";
import {
  logPromptInjectionAttempt,
  sanitizeUserInput,
} from "@/lib/prompt-injection-detection";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import {
  type RollingContext,
  createRollingContext,
  buildCompressedContext,
  calculateQualitySignals,
  detectParticipantStyle,
  calculateProgress,
  determineConversationState,
  getMemoryUpdatePrompt,
  applyMemoryUpdate,
  getContextKey,
  getStartTimeKey,
} from "@/lib/conversation-memory";
import { getRedisClient } from "@/lib/redis";

export const maxDuration = 300;



/**
 * Load or create rolling context for a conversation
 */
async function loadOrCreateContext(
  conversationId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  config: SurveyConfig
): Promise<RollingContext> {
  const redis = getRedisClient();
  const contextKey = getContextKey(conversationId);
  const startTimeKey = getStartTimeKey(conversationId);

  // Try to load existing context
  const existingContext = await redis.get(contextKey);
  const startTimeStr = await redis.get(startTimeKey);
  const startTime = startTimeStr ? new Date(startTimeStr) : new Date();

  let context: RollingContext;

  if (existingContext) {
    try {
      context = JSON.parse(existingContext) as RollingContext;
    } catch {
      context = createRollingContext(config, startTime);
    }
  } else {
    context = createRollingContext(config, startTime);
    // Store start time for new conversations
    await redis.set(startTimeKey, startTime.toISOString(), "EX", 7200); // 2 hour expiry
  }

  // Update context with current messages
  context = buildCompressedContext(messages, context);

  // Calculate quality signals
  context.qualitySignals = calculateQualitySignals(messages);

  // Detect participant style
  context.memory.participantStyle = detectParticipantStyle(messages);

  // Calculate progress
  context.progress = calculateProgress(
    messages,
    config,
    startTime,
    context.memory.topicsCovered
  );

  // Update conversation state
  context.stateContext = {
    ...context.stateContext,
    previousState: context.stateContext.currentState,
    currentState: determineConversationState(
      context.progress,
      messages.length,
      config
    ),
    stateEnteredAt: messages.length,
    transitionReason: null,
  };

  return context;
}

/**
 * Update conversation memory using AI analysis (async, non-blocking)
 */
async function updateMemoryAsync(
  conversationId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  config: SurveyConfig,
  existingContext: RollingContext
): Promise<void> {
  try {
    // Only update every 2-3 exchanges to save costs
    if (messages.length < 4 || messages.length % 2 !== 0) return;

    const memoryPrompt = getMemoryUpdatePrompt(
      messages,
      config,
      existingContext.memory
    );

    const schema = z.object({
      keyFactsLearned: z.array(z.string()).optional(),
      topicsCovered: z.array(z.string()).optional(),
      currentTopic: z.string().nullable().optional(),
      unansweredQuestions: z.array(z.string()).optional(),
      emotionalSignals: z.array(z.string()).optional(),
      conversationSummary: z.string().optional(),
      specificExamples: z.array(z.string()).optional(),
      unexploredHypotheses: z.array(z.string()).optional(),
      timelineEvents: z.array(z.string()).optional(),
      peerContext: z.array(z.string()).optional(),
      participantSuggestedSolutions: z.array(z.string()).optional(),
      hypothesesEvidence: z.record(z.object({
        supporting: z.array(z.string()),
        contradicting: z.array(z.string())
      })).optional()
    });

    const { output: update } = await generateText({
      model: analysisModel,
      output: Output.object({ schema }),
      system: "You are an expert conversation analyst. Update the memory based on the latest messages.",
      prompt: memoryPrompt,
      temperature: 0.3,
    });

    const updatedMemory = applyMemoryUpdate(
      existingContext.memory,
      update,
      config
    );

    // Save updated context to Redis
    const redis = getRedisClient();
    const contextKey = getContextKey(conversationId);
    const updatedContext: RollingContext = {
      ...existingContext,
      memory: updatedMemory,
    };
    await redis.set(contextKey, JSON.stringify(updatedContext), "EX", 7200);
  } catch (error) {
    console.error("[Chat Route] Memory update error:", error);
    // Non-critical - continue without memory update
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
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
          headers: {
            "Content-Type": "application/json",
            "Retry-After": rateLimitResult.reset.toString(),
            "X-RateLimit-Limit": "20",
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": rateLimitResult.reset.toString(),
          },
        }
      );
    }

    const { surveyId } = await params;
    const body = await request.json();
    const { messages, conversationId } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      conversationId?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response("Invalid messages", { status: 400 });
    }

    const sanitizedMessages = messages.map((msg) => {
      if (msg.role === "user") {
        logPromptInjectionAttempt(msg.content, {
          surveyId,
          conversationId,
        });
        return {
          ...msg,
          content: sanitizeUserInput(msg.content),
        };
      }
      return msg;
    });

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    if (survey.status !== "active") {
      return new Response("Survey is not active", { status: 403 });
    }

    if (survey.currentParticipants >= survey.participantLimit) {
      return new Response("Survey has reached participant limit", {
        status: 403,
      });
    }

    const surveyConfig = buildCompleteSurveyConfig(survey);

    let convId = conversationId;
    if (!convId) {
      convId = nanoid();

      await db.insert(surveyConversations).values({
        id: convId,
        surveyId: survey.id,
        rawConversation: sanitizedMessages.map((msg) => ({
          ...msg,
          timestamp: new Date().toISOString(),
        })),
        completed: false,
      });

      await db
        .update(surveys)
        .set({
          currentParticipants: survey.currentParticipants + 1,
        })
        .where(eq(surveys.id, survey.id));
    }

    // Load or create rolling context for this conversation
    const context = await loadOrCreateContext(
      convId,
      sanitizedMessages,
      surveyConfig
    );

    // Generate system prompt with context injection
    const systemPrompt = getSurveyConversationSystemPrompt(
      surveyConfig,
      survey.language,
      context
    );

    // Use the compressed messages for the AI call
    const messagesForAI =
      context.recentMessages.length > 0
        ? context.recentMessages
        : sanitizedMessages;

    // Define tools for the AI to call
    const tools = {
      showMedia: tool({
        description: "Display a media item (image, audio, or video) to the participant in the conversation",
        inputSchema: z.object({
          mediaId: z.string().describe("The unique ID of the media item to display"),
        }),
        execute: async ({ mediaId }) => {
          // Find the media in the survey config
          const media = surveyConfig.media?.find((m) => m.id === mediaId);
          if (!media) {
            return { error: "Media not found" };
          }
          // Return media details for the frontend to render
          return {
            success: true,
            media: {
              id: media.id,
              type: media.type,
              url: media.url,
              description: media.description,
              altText: media.altText,
              durationMs: media.durationMs,
            },
          };
        },
      }),
    };

    const result = streamText({
      model: defaultModel,
      messages: messagesForAI,
      system: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 2000,
      tools,
      stopWhen: stepCountIs(5), // Enable multi-step agent behavior with AI SDK v6
    });

    // Trigger async memory update (non-blocking)
    updateMemoryAsync(convId, sanitizedMessages, surveyConfig, context).catch(
      console.error
    );

    // Save updated context to Redis
    const redis = getRedisClient();
    await redis.set(getContextKey(convId), JSON.stringify(context), "EX", 7200);

    const response = result.toTextStreamResponse();
    response.headers.set("X-Conversation-Id", convId);
    response.headers.set(
      "X-Conversation-Progress",
      context.progress.completionPercentage.toString()
    );
    response.headers.set(
      "X-Conversation-State",
      context.stateContext.currentState
    );
    response.headers.set("X-RateLimit-Limit", "20");
    response.headers.set(
      "X-RateLimit-Remaining",
      rateLimitResult.remaining.toString()
    );
    response.headers.set("X-RateLimit-Reset", rateLimitResult.reset.toString());
    return response;
  } catch (error) {
    console.error("Error in chat route:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

/**
 * Save conversation messages (called after streaming completes)
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  try {
    const { surveyId } = await params;
    const body = await request.json();
    const { conversationId, messages, completed } = body as {
      conversationId: string;
      messages: Array<{
        role: "user" | "assistant";
        content: string;
        timestamp?: string;
      }>;
      completed?: boolean;
    };

    if (!conversationId || !Array.isArray(messages)) {
      return new Response("Invalid request", { status: 400 });
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    await db
      .update(surveyConversations)
      .set({
        rawConversation: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString(),
        })),
        completed: completed ?? false,
      })
      .where(eq(surveyConversations.id, conversationId));

    // Trigger conversation insights generation and Slack auto-post (if completed)
    if (completed) {
      // Trigger conversation insights generation (auto-generates analytics after insights are done)
      try {
        const { enqueueConversationInsights } = await import("@/lib/queue");
        await enqueueConversationInsights({
          conversationId,
          surveyId: survey.id,
          userId: survey.userId,
        });
        console.log(
          `[Chat Route] Enqueued conversation insights for conversation ${conversationId}`
        );
      } catch (error) {
        console.error("Failed to enqueue conversation insights:", error);
        // Don't fail the conversation save if insights enqueue fails
      }

      // Trigger Slack auto-post for new conversation
      try {
        const { autoPostNewConversation } = await import("@/app/actions/slack");
        autoPostNewConversation(survey.userId, survey.id, conversationId).catch(
          (error) => {
            console.error("Failed to auto-post conversation to Slack:", error);
            // Don't fail the conversation save if Slack post fails
          }
        );
      } catch (error) {
        console.error("Failed to import Slack auto-post function:", error);
      }

      // Trigger Zapier webhook for new conversation
      try {
        const { triggerNewConversationWebhook } = await import("@/lib/zapier/webhook-delivery");
        triggerNewConversationWebhook(conversationId, survey.id, survey.userId).catch(
          (error) => {
            console.error("Failed to trigger Zapier new conversation webhook:", error);
          }
        );
      } catch (error) {
        console.error("Failed to import Zapier webhook function:", error);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating conversation:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
