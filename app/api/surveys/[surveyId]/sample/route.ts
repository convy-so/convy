import { streamText, stepCountIs } from "ai";
import { and, eq, lt } from "drizzle-orm";

import { db } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { defaultModel } from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/session";
import { MAX_SAMPLE_CONVERSATIONS, buildCompleteSurveyConfig } from "@/lib/surveys";
import { apiRateLimiter, getClientIP } from "@/lib/ratelimit";
import { ConversationManager } from "@/lib/conversation-manager";

export const maxDuration = 300;

/**
 * Stream a sample conversation for the survey maker to review
 * This allows interactive testing of the conversation flow
 * Now supports extended survey configuration including tone and images
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  try {
    // Rate limiting check
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
      return new Response(
        `Invalid conversation number. Must be between 1 and ${MAX_SAMPLE_CONVERSATIONS}`,
        { status: 400 }
      );
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

    // Allow sample conversations for surveys in draft or sample_review status
    if (survey.status !== "draft" && survey.status !== "sample_review") {
      return new Response(
        "Survey must be in draft or sample_review status for sample conversations",
        { status: 400 }
      );
    }

    if (conversationNumber > survey.sampleConversationCount + 1) {
      return new Response("Sample conversations must be sequential", {
        status: 400,
      });
    }

    // Build complete survey config with all extended fields
    const surveyConfig = buildCompleteSurveyConfig(survey);

    // Get previous feedback from earlier sample conversations
    const previousFeedbackRows = await db
      .select({
        feedback: sampleConversations.feedback,
        finalComments: sampleConversations.finalComments,
      })
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, surveyId),
          lt(sampleConversations.conversationNumber, conversationNumber)
        )
      );

    // Combine all previous feedback
    const previousFeedback = previousFeedbackRows
      .flatMap((row) => [row.feedback, row.finalComments])
      .filter((value): value is string => !!value && value.trim().length > 0)
      .join("\n");

    const combinedFeedback = [previousFeedback, feedback]
      .filter((value): value is string => !!value && value.trim().length > 0)
      .join("\n\n");

    // Deterministic ID for context persistence during this sample session
    const conversationId = `sample:${surveyId}:${conversationNumber}:${session.user.id}`;

    // Load or create rolling context using Manager
    // If it's the first message, force new context to reset previous runs of this sample number
    const isStart = messages.length <= 1;
    const context = await ConversationManager.loadOrCreateContext(
      conversationId,
      messages,
      surveyConfig,
      isStart // forceNew
    );

    const systemPrompt = ConversationManager.getSystemPrompt(
      surveyConfig,
      context,
      {
         isSample: true,
         sampleFeedback: combinedFeedback,
         conversationNumber,
         language: survey.language
      }
    );

    // Define tools for the AI to call using Manager
    const tools = ConversationManager.getTools(surveyConfig);

    // Inject a transient user message to trigger the greeting if history is empty
    const messagesToLLM = [...messages];
    if (messagesToLLM.length === 0) {
      messagesToLLM.push({
        role: "user",
        // This message is invisible to the user but prompts the AI to start
        content: "Start the conversation now. Greet the participant according to the system prompt instructions.",
      });
    }

    const result = streamText({
      model: defaultModel,
      messages: messagesToLLM,
      system: systemPrompt,
      temperature: 0.8,
      maxOutputTokens: 2000,
      tools,
      stopWhen: stepCountIs(5),
    });

    // Trigger async memory update (non-blocking) using Manager
    ConversationManager.updateMemoryAsync(conversationId, messages, surveyConfig, context).catch(
      console.error
    );

    // Save updated context to Redis using Manager
    await ConversationManager.saveContext(conversationId, context);



    // Include remaining sample count in response headers
    const remainingSamples = MAX_SAMPLE_CONVERSATIONS - conversationNumber;
    const response = result.toTextStreamResponse();
    response.headers.set("X-Remaining-Samples", remainingSamples.toString());
    response.headers.set(
      "X-Conversation-Number",
      conversationNumber.toString()
    );

    return response;
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
