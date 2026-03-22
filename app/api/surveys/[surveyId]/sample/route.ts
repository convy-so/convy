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
import { normalizeMessages, extractAIGeneratedResponse } from "@/lib/ai";
import { ConversationManager } from "@/lib/conversation-manager";
import { MemoryBridge, TranscriptTurn } from "@/lib/memory-bridge";
import { ExpertStateStore } from "@/lib/expert-state-store";
import type { AgentContext } from "@/lib/agents/types";
import { ConductingSpecialist } from "@/lib/agents/conducting-specialist";
import { StreamFieldExtractor } from "@/lib/agents/streaming/stream-field-extractor";
import {
  withGeminiLimit,
  GeminiCapacityError,
  geminiCapacityResponse,
} from "@/lib/gemini-limiter";

export const maxDuration = 300;

/**
 * GET - Retrieve historical messages for a sample conversation
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { searchParams } = new URL(request.url);
    const conversationNumber = Number(searchParams.get("conversationNumber") || 1);

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

    const sampleId = `sample-${surveyId}-${conversationNumber}`;
    const [sample] = await getDb()
      .select()
      .from(sampleConversations)
      .where(eq(sampleConversations.id, sampleId));

    return new Response(JSON.stringify({ messages: sample?.messages || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Sample GET] Error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

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
    console.log(`[Sample POST] Incoming request for survey: ${surveyId}. Body:`, JSON.stringify(body, null, 2));
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

    const [memoryBridge] = await Promise.all([
      ConversationManager.loadOrCreateMemoryBridge(conversationId),
      upsertSampleRowPromise,
    ]);
    
    const expertState = await ExpertStateStore.get(surveyConfig.id);

    // Use raw messages, conducting agent streams prepends compressed transcript if memoryBridge is provided
    const messagesForAI = normalizedMessages;

    // --- AGENT INTEGRATION: Use ConductingSpecialist for agentic behavior ---
    const agentContext: AgentContext = {
      conversationId,
      messages: messagesForAI as any,
      surveyConfig,
      memoryBridge,
      expertState: expertState || undefined,
      language: survey.language as "en" | "fr" | "de" | "es" | "it" | undefined,
      modality: "text",
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
    const streamResult = await withGeminiLimit(async () => {
      return conductingAgent.stream(
        messagesToLLM as any,
        () => {}, // No media display in sample testing right now
        async (params: { text: string; usage: any; response: any }) => {
          const { text, usage, response } = params;
          const contentForStorage = extractAIGeneratedResponse(text);

          if (sampleId) {
            const newMessagesToAppend = response.messages.map((m: any) => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : (m.role === 'assistant' ? contentForStorage : ""),
              parts: Array.isArray(m.content) ? m.content : undefined,
              timestamp: m.timestamp || new Date().toISOString(),
            }));

            const dbMessages = [
              ...messagesToLLM,
              ...newMessagesToAppend
            ];

            // Check if AI completed survey (look for finishSurvey in any step)
            const isCompleted = response.messages.some((m: any) => 
               Array.isArray(m.content) && m.content.some((p: any) => (p.type === 'tool-call' || p.type === 'tool-invocation') && p.toolName === 'finishSurvey')
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

            if (expertState) {
              const newTurn: TranscriptTurn = {
                turnIndex: expertState.transcript.turns.filter((t: any) => t.type !== "summary_block").length + 1,
                speaker: "agent",
                text: contentForStorage,
                timestamp: new Date().toISOString(),
                type: "turn"
              };
              
              const respondentMsg = normalizedMessages[normalizedMessages.length - 1];
              if (respondentMsg && respondentMsg.role === "user") {
                 const resTurn: TranscriptTurn = {
                   turnIndex: expertState.transcript.turns.filter((t: any) => t.type !== "summary_block").length + 2,
                   speaker: "respondent",
                   text: typeof respondentMsg.content === 'string' ? respondentMsg.content : (Array.isArray(respondentMsg.content) ? (respondentMsg.content.find((p:any) => p.type === 'text') as any)?.text || "" : ""),
                   timestamp: new Date().toISOString(),
                   type: "turn"
                 };
                 resTurn.turnIndex = expertState.transcript.turns.filter((t: any) => t.type !== "summary_block").length + 1;
                 newTurn.turnIndex = resTurn.turnIndex + 1;
                 
                 expertState.transcript.turns.push(resTurn);
              }
              expertState.transcript.turns.push(newTurn);
              ExpertStateStore.update(surveyConfig.id, expertState).catch(console.error);
              
              ConversationManager.updateMemoryAsync(
                conversationId,
                surveyConfig,
                expertState,
                memoryBridge,
                newTurn,
                { userId: session.user.id }
              ).catch((err) =>
                console.error("[Sample Route] Async memory update failed:", err),
              );
            }
          }
        },
        undefined,
      );
    });

    // MemoryBridge state is automatically persisted in updateMemoryAsync

    // AI SDK v6 native UIMessage stream conversion
    const uiStream = streamResult.toUIMessageStream();

    const remainingSamples = MAX_SAMPLE_CONVERSATIONS - conversationNumber;

    const response = createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          const extractor = new StreamFieldExtractor();
          
          for await (const chunk of uiStream) {
            const chunkObj = chunk as any;
            if (chunkObj.type === "text-delta") {
              const delta = chunkObj.textDelta || chunkObj.delta;
              console.log(`[Sample Stream] Chunk:`, delta);
              const cleanText = extractor.processChunk(delta);
              if (cleanText) {
                console.log(`[Sample Stream] Yielding:`, cleanText);
                writer.write({ type: "text-delta", textDelta: cleanText } as any);
              }
            } else {
              writer.write(chunkObj);
            }
          }
          const finalCleanText = extractor.flush();
          if (finalCleanText) {
            console.log(`[Sample Stream] Final Flush:`, finalCleanText);
            writer.write({ type: "text-delta", textDelta: finalCleanText } as any);
          }
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
