import { eq } from "drizzle-orm";
import { streamText } from "ai";

import { db } from "@/db";
import { surveys, surveyCreationConversations } from "@/db/schema";
import { defaultModel } from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyCreationSystemPrompt,
  type CollectedInfo,
} from "@/lib/prompts";
import { apiRateLimiter, getClientIP } from "@/lib/ratelimit";

export const maxDuration = 300;

/**
 * Stream a survey creation conversation
 * This guides the survey maker through providing all necessary information
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  try {
    const clientIP = getClientIP(request);
    const rateLimitResult = await apiRateLimiter.limit(clientIP);

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
            "X-RateLimit-Limit": "100",
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": rateLimitResult.reset.toString(),
          },
        }
      );
    }

    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const { messages } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!Array.isArray(messages)) {
      return new Response("Invalid messages", { status: 400 });
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    if (survey.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 403 });
    }

    if (survey.status !== "creating") {
      return new Response(
        "Survey is not in creation mode. Status: " + survey.status,
        { status: 400 }
      );
    }

    const [creationConversation] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    const collectedInfo: CollectedInfo =
      creationConversation?.collectedInfo || {
        objective: false,
        targetAudience: false,
        scope: false,
        successCriteria: false,
        constraints: false,
        hypotheses: false,
        tone: false,
        additionalContext: false,
        requiredQuestions: false,
        metrics: false,
      };

    const systemPrompt = getSurveyCreationSystemPrompt(
      collectedInfo,
      survey.language
    );

    const result = streamText({
      model: defaultModel,
      messages,
      system: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 1500,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return new Response(error.message, { status: 401 });
      }
    }
    console.error("Error in create route:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

/**
 * Save creation conversation messages and extract survey data
 * Called after each AI response to update the conversation state
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const { messages, collectedInfo, extractedData } = body as {
      messages: Array<{
        role: "user" | "assistant";
        content: string;
        timestamp?: string;
      }>;
      collectedInfo?: CollectedInfo;
      extractedData?: Record<string, unknown>;
    };

    if (!Array.isArray(messages)) {
      return new Response("Invalid request", { status: 400 });
    }

    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    if (survey.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 403 });
    }

    const [existingConversation] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    const messagesWithTimestamp = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp || new Date().toISOString(),
    }));

    if (existingConversation) {
      await db
        .update(surveyCreationConversations)
        .set({
          messages: messagesWithTimestamp,
          ...(collectedInfo && { collectedInfo }),
          ...(extractedData && {
            extractedData: {
              ...existingConversation.extractedData,
              ...extractedData,
            },
          }),
        })
        .where(eq(surveyCreationConversations.surveyId, surveyId));
    } else {
      await db.insert(surveyCreationConversations).values({
        id: crypto.randomUUID(),
        surveyId,
        messages: messagesWithTimestamp,
        status: "in_progress",
        collectedInfo: collectedInfo || {
          objective: false,
          targetAudience: false,
          scope: false,
          successCriteria: false,
          constraints: false,
          hypotheses: false,
          tone: false,
          additionalContext: false,
          requiredQuestions: false,
          metrics: false,
        },
        extractedData: extractedData || {},
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return new Response(error.message, { status: 401 });
      }
    }
    console.error("Error updating creation conversation:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
