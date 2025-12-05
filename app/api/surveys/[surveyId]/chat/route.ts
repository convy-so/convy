import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { streamText } from "ai";

import { db } from "@/db";
import { surveyConversations, surveys } from "@/db/schema";
import { defaultModel } from "@/lib/ai";
import { getSurveyConversationSystemPrompt } from "@/lib/prompts";
import { chatRateLimiter, getClientIP } from "@/lib/ratelimit";
import {
  logPromptInjectionAttempt,
  sanitizeUserInput,
} from "@/lib/prompt-injection-detection";
import { buildCompleteSurveyConfig } from "@/lib/surveys";

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

    const systemPrompt = getSurveyConversationSystemPrompt(
      surveyConfig,
      survey.language
    );

    const result = streamText({
      model: defaultModel,
      messages: sanitizedMessages,
      system: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 2000,
    });

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

    const response = result.toTextStreamResponse();
    response.headers.set("X-Conversation-Id", convId);
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

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating conversation:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
