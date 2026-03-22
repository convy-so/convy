import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import {
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
} from "ai";

import { getDb } from "@/db";
import { surveyConversations, surveys } from "@/db/schema";
import { chatRateLimiter, getClientIP } from "@/lib/ratelimit";
import { normalizeMessages, extractAIGeneratedResponse } from "@/lib/ai";
import {
  logPromptInjectionAttempt,
  sanitizeUserInput,
} from "@/lib/prompt-injection-detection";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import { ConversationManager } from "@/lib/conversation-manager";
import { TranscriptTurn } from "@/lib/memory-bridge";
import { ExpertStateStore } from "@/lib/expert-state-store";
import { ConductingSpecialist } from "@/lib/agents/conducting-specialist";
import { domainBrain } from "@/lib/domain-brain";
import { StreamFieldExtractor } from "@/lib/agents/streaming/stream-field-extractor";

import type { AgentContext } from "@/lib/agents/types";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
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
        },
      );
    }

    const { surveyId } = await params;
    const body = await request.json();
    const { messages, conversationId } = body as {
      messages: Array<any>;
      conversationId?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response("Invalid messages", { status: 400 });
    }

    const normalizedMessages = await normalizeMessages(messages);

    const sanitizedMessages = normalizedMessages.map((msg) => {
      if (msg.role === "user") {
        const textContent = typeof msg.content === "string" ? msg.content : "";
        logPromptInjectionAttempt(textContent, {
          surveyId,
          conversationId,
        });
        return {
          ...msg,
          content: sanitizeUserInput(textContent),
        };
      }
      return msg;
    });

    const [survey] = await getDb()
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

      await getDb().insert(surveyConversations).values({
        id: convId,
        surveyId: survey.id,
        rawConversation: sanitizedMessages.map((msg) => ({
          ...msg,
          content:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
          role:
            msg.role === "system"
              ? "assistant"
              : (msg.role as "user" | "assistant"),
          timestamp: new Date().toISOString(),
        })),
        completed: false,
      });

      await getDb()
        .update(surveys)
        .set({
          currentParticipants: survey.currentParticipants + 1,
        })
        .where(eq(surveys.id, survey.id));
    }

    // Load or create MemoryBridge 
    const memoryBridge = await ConversationManager.loadOrCreateMemoryBridge(convId);

    const messagesForAI = sanitizedMessages;
    const expertState = await ExpertStateStore.get(survey.id);

    // --- AGENT INTEGRATION: Use ConductingSpecialist for agentic behavior ---
    const agentContext: AgentContext = {
      conversationId: convId,
      messages: messagesForAI as ModelMessage[],
      surveyConfig,
      memoryBridge,
      expertState: expertState || undefined,
      language: survey.language as "en" | "fr" | "de" | "es" | "it" | undefined,
      userId: survey.userId,
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
      console.warn("[Chat Route] Failed to preload agent capabilities:", error),
    );

    // Use the agent's stream method which includes domain expertise, checklist, and tools
    // Pass onFinish callback for persistence
    const result = conductingAgent.stream(
      messagesForAI as ModelMessage[],
      undefined, // onMediaDisplay - not needed for text chat
      async ({ text, response }) => {
        const contentForStorage = extractAIGeneratedResponse(text);
        // Persistence logic for participant chat
        try {
          const [currentConv] = await getDb()
            .select()
            .from(surveyConversations)
            .where(eq(surveyConversations.id, convId!));

          if (currentConv) {
            const currentMessages = currentConv.rawConversation as Array<any>;
            
            const newMessagesToAppend = response.messages.map((m: any) => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : (m.role === 'assistant' ? contentForStorage : ""),
              parts: Array.isArray(m.content) ? m.content : undefined,
              timestamp: new Date().toISOString(),
            }));

            const updatedMessages = [
              ...currentMessages,
              ...newMessagesToAppend
            ];

            await getDb()
              .update(surveyConversations)
              .set({
                rawConversation: updatedMessages,
              })
              .where(eq(surveyConversations.id, convId!));
              
            if (expertState) {
              const newTurnText = contentForStorage || "";
              const newTurn: TranscriptTurn = {
                turnIndex: expertState.transcript.turns.filter((t: any) => t.type !== "summary_block").length + 1,
                speaker: "agent",
                text: newTurnText,
                timestamp: new Date().toISOString(),
                type: "turn"
              };
              
              const respondentMsg = sanitizedMessages[sanitizedMessages.length - 1];
              if (respondentMsg && respondentMsg.role === "user") {
                 const resTurn: TranscriptTurn = {
                   turnIndex: expertState.transcript.turns.filter((t: any) => t.type !== "summary_block").length + 1,
                   speaker: "respondent",
                   text: typeof respondentMsg.content === 'string' ? respondentMsg.content : "",
                   timestamp: new Date().toISOString(),
                   type: "turn"
                 };
                 newTurn.turnIndex = resTurn.turnIndex + 1;
                 expertState.transcript.turns.push(resTurn);
              }
              expertState.transcript.turns.push(newTurn);
              await ExpertStateStore.update(survey.id, expertState);
              
              ConversationManager.updateMemoryAsync(
                convId!,
                surveyConfig,
                expertState,
                memoryBridge,
                newTurn,
                { userId: survey.userId, organizationId: survey.organizationId || undefined }
              ).catch(console.error);
            }
          }
        } catch (error) {
          console.error(
            "Error saving participant conversation message:",
            error,
          );
        }
      },
    );

    // AI SDK v6 native UIMessage stream conversion
    const uiStream = result.toUIMessageStream();

    const responseStream = createUIMessageStream({
      execute: async ({ writer }) => {
        const extractor = new StreamFieldExtractor();
        
        for await (const chunk of uiStream) {
          const chunkObj = chunk as any;
          if (chunkObj.type === "text-delta") {
            const cleanText = extractor.processChunk(chunkObj.textDelta || chunkObj.delta);
            if (cleanText) {
              writer.write({ type: "text-delta", textDelta: cleanText } as any);
            }
          } else {
            writer.write(chunkObj);
          }
        }
        const finalCleanText = extractor.flush();
        if (finalCleanText) {
          writer.write({ type: "text-delta", textDelta: finalCleanText } as any);
        }
      },
    });

    // Load ExpertState for V2 headers
    const latestExpertState = await ExpertStateStore.get(survey.id);
    const coverage = latestExpertState ? domainBrain.calculateCoverage(latestExpertState) : 0;

    const response = createUIMessageStreamResponse({ stream: responseStream });
    response.headers.set("X-Conversation-Id", convId);
    response.headers.set(
      "X-Conversation-Progress",
      Math.round(coverage * 100).toString(),
    );
    response.headers.set(
      "X-Conversation-State",
      latestExpertState ? domainBrain.getNextPriorityTopic(latestExpertState)?.label || "Wrap up" : "Greeting",
    );
    response.headers.set("X-RateLimit-Limit", "20");
    response.headers.set(
      "X-RateLimit-Remaining",
      rateLimitResult.remaining.toString(),
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
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const { surveyId } = await params;
    const body = await request.json();
    const { conversationId, messages, completed } = body as {
      conversationId: string;
      messages: Array<any>;
      completed?: boolean;
    };

    if (!conversationId || !Array.isArray(messages)) {
      return new Response("Invalid request", { status: 400 });
    }

    const [survey] = await getDb()
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
          new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime(),
      );

    let durationMs = 0;
    let activeDurationMs = 0;
    const MAX_ACTIVE_GAP_MS = 2 * 60 * 1000; // 2 minutes threshold for "active" time per message

    if (sortedMessages.length > 1) {
      const startTime = new Date(sortedMessages[0].timestamp!).getTime();
      const endTime = new Date(
        sortedMessages[sortedMessages.length - 1].timestamp!,
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

    await getDb()
      .update(surveyConversations)
      .set({
        rawConversation: messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          parts: msg.parts,
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
          `[Chat Route] Enqueued conversation insights for conversation ${conversationId}`,
        );
      } catch (error) {
        console.error("Failed to enqueue conversation insights:", error);
        // Don't fail the conversation save if insights enqueue fails
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
