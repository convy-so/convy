import { streamText } from "ai";

import { db } from "@/db";
import { surveys } from "@/db/schema";
import { defaultModel } from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSampleConversationSystemPrompt,
  type SurveyConfig,
} from "@/lib/prompts";
import { eq } from "drizzle-orm";

export const maxDuration = 300;

/**
 * Stream a sample conversation for the survey maker to review
 * This allows interactive testing of the conversation flow
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const { messages, feedback, conversationNumber } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      feedback?: string;
      conversationNumber?: number;
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

    const surveyConfig: SurveyConfig = {
      goal: survey.goal,
      type: survey.type,
      information: survey.information,
      requiredQuestions: survey.requiredQuestions,
      metrics: survey.metrics || [],
    };

    const systemPrompt = getSampleConversationSystemPrompt(
      surveyConfig,
      feedback,
      conversationNumber
    );

    const result = streamText({
      model: defaultModel,
      messages,
      system: systemPrompt,
      temperature: 0.8,
      maxOutputTokens: 2000,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
        return new Response(error.message, { status: 401 });
      }
    }
    console.error("Error in sample route:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

