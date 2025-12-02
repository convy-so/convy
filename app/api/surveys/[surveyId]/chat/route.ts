import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { streamText } from "ai";

import { db } from "@/db";
import { surveyConversations, surveys } from "@/db/schema";
import { defaultModel } from "@/lib/ai";
import { getSurveyConversationSystemPrompt, type SurveyConfig } from "@/lib/prompts";

export const maxDuration = 300; 

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  try {
    const { surveyId } = await params;
    const body = await request.json();
    const { messages, conversationId } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      conversationId?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response("Invalid messages", { status: 400 });
    }

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
      return new Response("Survey has reached participant limit", { status: 403 });
    }

    const surveyConfig: SurveyConfig = {
      goal: survey.goal,
      type: survey.type,
      information: survey.information,
      requiredQuestions: survey.requiredQuestions,
      metrics: survey.metrics || [],
      language: survey.language,
    };

    const systemPrompt = getSurveyConversationSystemPrompt(surveyConfig, survey.language);

    const result = streamText({
      model: defaultModel,
      messages,
      system: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 2000,
    });

    // Create or get conversation ID
    let convId = conversationId;
    if (!convId) {
      convId = nanoid();

      // Create conversation record
      await db.insert(surveyConversations).values({
        id: convId,
        surveyId: survey.id,
        rawConversation: messages.map((msg) => ({
          ...msg,
          timestamp: new Date().toISOString(),
        })),
        completed: false,
      });

      // Increment participant count if this is a new conversation
      await db
        .update(surveys)
        .set({
          currentParticipants: survey.currentParticipants + 1,
        })
        .where(eq(surveys.id, survey.id));
    }

    // Return streaming response with conversation ID in headers
    const response = result.toTextStreamResponse();
    response.headers.set("X-Conversation-Id", convId);
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
      messages: Array<{ role: "user" | "assistant"; content: string; timestamp?: string }>;
      completed?: boolean;
    };

    if (!conversationId || !Array.isArray(messages)) {
      return new Response("Invalid request", { status: 400 });
    }

    // Verify survey exists
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.shareableLink, surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    // Update conversation
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

