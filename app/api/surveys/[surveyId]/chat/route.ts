import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { streamText, stepCountIs } from "ai";

import { db } from "@/db";
import { surveyConversations, surveys } from "@/db/schema";
import { defaultModel } from "@/lib/ai";
import { chatRateLimiter, getClientIP } from "@/lib/ratelimit";
import {
  logPromptInjectionAttempt,
  sanitizeUserInput,
} from "@/lib/prompt-injection-detection";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import { ConversationManager } from "@/lib/conversation-manager";

export const maxDuration = 300;

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

    // Load or create rolling context for this conversation using Manager
    const context = await ConversationManager.loadOrCreateContext(
      convId,
      sanitizedMessages,
      surveyConfig
    );

    // Generate system prompt with context injection using Manager
    const systemPrompt = ConversationManager.getSystemPrompt(
      surveyConfig,
      context,
      { language: survey.language }
    );

    // Use the compressed messages for the AI call
    const messagesForAI =
      context.recentMessages.length > 0
        ? context.recentMessages
        : sanitizedMessages;

    // Define tools for the AI to call using Manager
    const tools = ConversationManager.getTools(surveyConfig);

    const result = streamText({
      model: defaultModel,
      messages: messagesForAI,
      system: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 2000,
      tools,
      stopWhen: stepCountIs(5), // Enable multi-step agent behavior with AI SDK v6
    });

    // Trigger async memory update (non-blocking) using Manager
    ConversationManager.updateMemoryAsync(convId, sanitizedMessages, surveyConfig, context).catch(
      console.error
    );

    // Save updated context to Redis using Manager
    await ConversationManager.saveContext(convId, context);

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

    // Calculate duration metrics
    const sortedMessages = messages
      .filter((m) => m.timestamp)
      .sort(
        (a, b) =>
          new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime()
      );

    let durationMs = 0;
    let activeDurationMs = 0;
    const MAX_ACTIVE_GAP_MS = 2 * 60 * 1000; // 2 minutes threshold for "active" time per message

    if (sortedMessages.length > 1) {
      const startTime = new Date(sortedMessages[0].timestamp!).getTime();
      const endTime = new Date(
        sortedMessages[sortedMessages.length - 1].timestamp!
      ).getTime();
      durationMs = endTime - startTime;

      // Calculate active duration by summing gaps, capped at threshold
      for (let i = 1; i < sortedMessages.length; i++) {
        const prevTime = new Date(sortedMessages[i - 1].timestamp!).getTime();
        const currTime = new Date(sortedMessages[i].timestamp!).getTime();
        const gap = currTime - prevTime;
        
        // Only valid positive gaps
        if (gap > 0) {
            activeDurationMs += Math.min(gap, MAX_ACTIVE_GAP_MS);
        }
      }
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
        durationMs,
        activeDurationMs,
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
