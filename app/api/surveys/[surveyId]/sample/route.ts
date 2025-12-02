import { streamText } from "ai";
import { and, eq, lt } from "drizzle-orm";

import { db } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { defaultModel } from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSampleConversationSystemPrompt,
  type SurveyConfig,
} from "@/lib/prompts";
import { MAX_SAMPLE_CONVERSATIONS } from "@/lib/surveys";

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

    if (
      !conversationNumber ||
      conversationNumber < 1 ||
      conversationNumber > MAX_SAMPLE_CONVERSATIONS
    ) {
      return new Response("Invalid conversation number", { status: 400 });
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

    if (conversationNumber > survey.sampleConversationCount + 1) {
      return new Response("Sample conversations must be sequential", {
        status: 400,
      });
    }

    const surveyConfig: SurveyConfig = {
      goal: survey.goal,
      type: survey.type,
      information: survey.information,
      requiredQuestions: survey.requiredQuestions,
      metrics: survey.metrics || [],
      language: survey.language,
    };

    const previousFeedbackRows = await db
      .select({ feedback: sampleConversations.feedback })
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, surveyId),
          lt(sampleConversations.conversationNumber, conversationNumber)
        )
      );

    const aggregatedFeedback = previousFeedbackRows
      .map((row) => row.feedback)
      .filter((value): value is string => !!value)
      .join("\n");

    const combinedFeedback = [aggregatedFeedback, feedback]
      .filter((value): value is string => !!value && value.trim().length > 0)
      .join("\n\n");

    const systemPrompt = getSampleConversationSystemPrompt(
      surveyConfig,
      combinedFeedback || undefined,
      conversationNumber,
      survey.language
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
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return new Response(error.message, { status: 401 });
      }
    }
    console.error("Error in sample route:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
