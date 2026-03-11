import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { and, eq, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";

import {
  MAX_SAMPLE_CONVERSATIONS,
  buildCompleteSurveyConfig,
} from "@/lib/surveys";
import { apiRateLimiter, getClientIP } from "@/lib/ratelimit";
import { normalizeMessages } from "@/lib/ai";
import { ConversationManager } from "@/lib/conversation-manager";
import { ConductingSpecialist } from "@/lib/agents/conducting-specialist";
import type { AgentContext } from "@/lib/agents/types";
import {
  withGeminiLimit,
  GeminiCapacityError,
  geminiCapacityResponse,
} from "@/lib/gemini-limiter";

export const maxDuration = 300;

/**
 * Stream a sample conversation for the survey maker to review
 * This allows interactive testing of the conversation flow
 * Now supports extended survey configuration including tone and images
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
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
        },
      );
    }

    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const { messages, feedback, conversationNumber } = body as {
      messages: any[];
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
        { status: 400 },
      );
    }

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return new Response("Survey not found", { status: 404 });
    }

    const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access === "none") {
      return new Response("Unauthorized", { status: 403 });
    }

    // Allow sample conversations for surveys in draft or sample_review status
    if (survey.status !== "draft" && survey.status !== "sample_review") {
      return new Response(
        "Survey must be in draft or sample_review status for sample conversations",
        { status: 400 },
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
    const previousFeedbackRows = await getDb()
      .select({
        feedback: sampleConversations.feedback,
        finalComments: sampleConversations.finalComments,
      })
      .from(sampleConversations)
      .where(
        and(
          eq(sampleConversations.surveyId, surveyId),
          lt(sampleConversations.conversationNumber, conversationNumber),
        ),
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
    const sampleId = `sample-${surveyId}-${conversationNumber}`;

    const normalizedMessages = await normalizeMessages(messages);

    // UPSERT the sampleConversations row so onFinish UPDATE always finds a real row.
    // Without this, conversation history was silently dropped every turn (stuck survey bug).
    const upsertSampleRowPromise = getDb()
      .insert(sampleConversations)
      .values({
        id: sampleId,
        surveyId: survey.id,
        conversationNumber,
        messages: [],
      })
      .onConflictDoNothing()
      .catch((err) =>
        console.error("[Sample Route] Failed to upsert sample row:", err),
      );

    // Load or create rolling context using Manager
    // If it's the first message, force new context to reset previous runs of this sample number
    const isStart = normalizedMessages.length <= 1;
    const [context] = await Promise.all([
      ConversationManager.loadOrCreateContext(
        conversationId,
        normalizedMessages,
        surveyConfig,
        isStart, // forceNew
      ),
      // Ensure the sample row exists — runs concurrently with context load
      upsertSampleRowPromise,
    ]);

    // Use the compressed messages for the AI call
    const messagesForAI =
      context.recentMessages.length > 0
        ? context.recentMessages
        : normalizedMessages;

    // --- AGENT INTEGRATION: Use ConductingSpecialist for agentic behavior ---
    const agentContext: AgentContext = {
      conversationId,
      messages: messagesForAI as any,
      surveyConfig,
      rollingContext: context,
      language: survey.language as "en" | "fr" | "de" | "es" | "it" | undefined,
      isSample: true,
      sampleFeedback: combinedFeedback,
      conversationNumber,
      userId: session.user.id,
      organizationId: survey.organizationId || undefined,
    };

    const conductingAgent = new ConductingSpecialist(agentContext);
    await conductingAgent.initialize();

    // Preload pattern learnings and skills for the agent
    await Promise.all([
      conductingAgent.preloadSkills(),
      conductingAgent.preloadPatternLearnings(
        ["questioning", "probing", "engagement"],
        2,
      ),
    ]).catch((error) =>
      console.warn(
        "[Sample Route] Failed to preload agent capabilities:",
        error,
      ),
    );

    // Inject a transient user message to trigger the greeting if history is empty
    const messagesToLLM = [...messagesForAI];
    if (messagesToLLM.length === 0) {
      messagesToLLM.push({
        role: "user",
        // This message is invisible to the user but prompts the AI to start
        content:
          "Start the conversation now. Greet the participant according to the system prompt instructions.",
      });
    }

    // Use the agent's stream method which includes domain expertise, checklist, and tools
    // No onFinish callback needed for DB persistence as sample routes are ephemeral
    const streamResult = await withGeminiLimit(async () => {
      return conductingAgent.stream(
        messagesToLLM as any,
        () => {}, // No media display in sample testing right now
        async (params) => {
          const { text, usage, response } = params;

          // ... (existing logging / db / queue logic internally handled by stream wrapper)
          const assistantMessage = response.messages?.find(
            (m: any) => m.role === "assistant",
          );

          const updatedMessages = [
            ...messagesToLLM, // Use messagesToLLM as the base for updated messages
            {
              role: "assistant" as const,
              content: text,
              parts:
                (assistantMessage as any)?.content &&
                Array.isArray((assistantMessage as any).content)
                  ? (assistantMessage as any).content
                  : undefined,
              timestamp: new Date().toISOString(),
            },
          ];

          if (sampleId) {
            const dbMessages = updatedMessages.map((m: any) => ({
              role: m.role,
              content: m.content,
              parts: m.parts,
              timestamp: m.timestamp || new Date().toISOString(),
            }));

            // Check if AI completed survey
            const toolInvocations = assistantMessage?.toolInvocations || [];
            let isCompleted = !!toolInvocations.find(
              (call: any) => call.toolName === "finishSurvey",
            );

            await getDb()
              .update(sampleConversations)
              .set({
                messages: dbMessages,
                updatedAt: new Date(),
              })
              .where(eq(sampleConversations.id, sampleId));

            if (isCompleted) {
              const { enqueueSampleConversationInsights } =
                await import("@/lib/queue");
              await enqueueSampleConversationInsights({
                surveyId: survey.id,
                conversationNumber: Number(sampleId.split("-").pop() || 1),
                messages: dbMessages as any,
                userId: session.user.id,
              });
            }
          }
        },
        undefined,
      );
    });

    ConversationManager.updateMemoryAsync(
      conversationId,
      normalizedMessages,
      surveyConfig,
      context,
    ).catch(console.error);

    // Save updated context to Redis using Manager
    await ConversationManager.saveContext(conversationId, context);

    // AI SDK v6 native UIMessage stream conversion
    const uiStream = streamResult.toUIMessageStream();

    const remainingSamples = MAX_SAMPLE_CONVERSATIONS - conversationNumber;

    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.merge(uiStream);
        },
      }),
    });
    response.headers.set("X-Remaining-Samples", remainingSamples.toString());
    response.headers.set(
      "X-Conversation-Number",
      conversationNumber.toString(),
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
