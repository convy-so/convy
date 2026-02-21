import { db } from "@/db";
import { surveys, surveyConversations, voiceSessions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { type SurveyConfig } from "@/lib/prompts";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import {
  type RollingContext,
  getContextKey,
  getStartTimeKey,
} from "@/lib/conversation-memory";
import { enqueueConversationInsights } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis";
import { WebSocket } from "ws";
import { BaseVoiceAgentHandler } from "./base-voice-agent-handler";
import { ConversationManager } from "@/lib/conversation-manager";
import { ConductingSpecialist } from "@/lib/agents/conducting-specialist";
import type { AgentContext } from "@/lib/agents/types";
import type { ModelMessage } from "ai";
import {
  buildVoiceAgentSettings,
  type VoiceAgentSettings,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
} from "@/lib/voice/deepgram-voice-agent";

// Estimated costs (per Deepgram pricing)
const ESTIMATED_STT_COST_PER_MINUTE = 0.0059;
const ESTIMATED_TTS_COST_PER_CHAR = 0.000015; // ~$0.015 per 1000 chars

interface ResponseState {
  surveyId: string;
  conversationId: string | null;
  voiceSessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  survey: typeof surveys.$inferSelect | null;
  language: SupportedLanguage;
  context: RollingContext | null;
  surveyConfig: SurveyConfig | null;
}

export class SurveyResponseVoiceHandler extends BaseVoiceAgentHandler {
  private state: ResponseState;

  // Specific to response handler
  private participantId: string;
  private sessionStartTime: number = Date.now();
  private cleanupStarted: boolean = false;

  // Billing & State context
  private ownerId: string | null = null;
  private organizationId: string | null = null;

  constructor(
    ws: WebSocket,
    surveyId: string,
    identifier: string,
    language?: string,
  ) {
    // Pass to base (no userId for respondent sessions)
    super(ws, identifier);

    this.participantId = nanoid();

    this.state = {
      surveyId,
      conversationId: null,
      voiceSessionId: nanoid(),
      messages: [],
      survey: null,
      language: (language as SupportedLanguage) || "en",
      context: null,
      surveyConfig: null,
    };
  }

  async initialize(): Promise<void> {
    try {
      // Load survey by shareable link
      const [survey] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.shareableLink, this.state.surveyId));

      if (!survey) {
        this.sendError("Survey not found");
        this.ws.close();
        return;
      }

      if (survey.status !== "active") {
        this.sendError("Survey is not active");
        this.ws.close();
        return;
      }

      if (survey.currentParticipants >= survey.participantLimit) {
        this.sendError("Survey has reached participant limit");
        this.ws.close();
        return;
      }

      this.state.survey = survey;

      // CRITICAL: Respect respondent's language choice (from WebSocket URL parameter)
      // Only use survey.language as fallback if no language was provided by respondent
      if (!this.state.language || this.state.language === "en") {
        // If respondent didn't explicitly choose a language, use survey's default
        this.state.language = (survey.language as SupportedLanguage) || "en";
        console.log(
          `[Survey Response Voice] Using survey default language: ${this.state.language}`,
        );
      } else {
        console.log(
          `[Survey Response Voice] Using respondent's chosen language: ${this.state.language}`,
        );
      }

      this.state.surveyConfig = buildCompleteSurveyConfig(survey);

      // Load or create context using Manager
      this.state.context = await ConversationManager.loadOrCreateContext(
        this.identifier,
        [],
        this.state.surveyConfig,
      );

      // Restore start time from redis or use current
      const redis = getRedisClient();
      const startTimeKey = getStartTimeKey(this.identifier);
      const startTimeStr = await redis.get(startTimeKey);
      this.sessionStartTime = startTimeStr
        ? new Date(startTimeStr).getTime()
        : Date.now();

      // Create voice session in database
      await db.insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        surveyId: survey.id,
        sessionType: "survey_response",
        status: "active",
        startedAt: new Date(),
      });

      // Create conversation
      const conversationId = nanoid();
      await db.insert(surveyConversations).values({
        id: conversationId,
        surveyId: survey.id,
        participantId: this.participantId,
        rawConversation: [],
        completed: false,
        originalLanguage: this.state.language,
      });

      this.state.conversationId = conversationId;

      await db
        .update(surveys)
        .set({
          currentParticipants: sql`current_participants + 1`,
        })
        .where(eq(surveys.id, survey.id));

      // Start idle timeout
      this.resetIdleTimeout();

      // Send ready message
      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
        conversationId,
        language: this.state.language,
      });

      // Connect Voice Agent (greeting/welcome handled via Settings)
      await this.connectVoiceAgent();
    } catch (error) {
      console.error("[Survey Response Voice] Initialization error:", error);
      this.sendError("Failed to initialize voice session");
      this.ws.close();
    }
  }

  protected getLanguage(): SupportedLanguage {
    return this.state.language;
  }

  protected getInitialUserInput(): string | null {
    // Trigger the AI to start the survey response dynamically
    return "Start the survey interaction. Greet the participant and ask the first question according to the system prompt.";
  }

  protected async getVoiceAgentSettings(): Promise<VoiceAgentSettings> {
    if (!this.state.surveyConfig || !this.state.context) {
      throw new Error("Survey config or context not initialized");
    }

    // --- AGENT INTEGRATION: Use ConductingSpecialist for agentic behavior ---
    const agentContext: AgentContext = {
      conversationId: this.identifier,
      messages: this.state.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as ModelMessage[],
      surveyConfig: this.state.surveyConfig!,
      rollingContext: this.state.context!,
      language: this.state.language,
    };

    const conductingAgent = new ConductingSpecialist(agentContext);

    // Preload capabilities
    await Promise.all([
      conductingAgent.preloadSkills(),
      conductingAgent.preloadPatternLearnings(
        ["questioning", "probing", "engagement"],
        2,
      ),
    ]);

    // Use the agent's system prompt (includes domain expertise, checklist, questioning strategy)
    const systemPrompt = conductingAgent.buildSystemPrompt();

    // Use the agent's function definitions (converted to Deepgram format)
    const functions = conductingAgent.getDeepgramFunctions();

    const tone = (this.state.survey?.tone || "casual") as
      | "casual"
      | "formal"
      | "playful"
      | "empathetic";

    return buildVoiceAgentSettings({
      language: this.state.language,
      tone,
      systemPrompt,
      functions,
      conversationHistory:
        this.state.messages.length > 0
          ? this.state.messages.map((m) => ({
              role: m.role,
              content: m.content,
            }))
          : undefined,
    });
  }

  protected async onConversationText(
    event: ConversationTextEvent,
  ): Promise<void> {
    const now = new Date();
    const lastMessage = this.state.messages[this.state.messages.length - 1];

    // Aggregation logic: Same role and within 5 seconds
    if (
      lastMessage &&
      lastMessage.role === event.role &&
      lastMessage.timestamp &&
      now.getTime() - new Date(lastMessage.timestamp).getTime() < 3000
    ) {
      console.log(
        `[SurveyResponseVoiceHandler] 🔄 Aggregating ${event.role} message in DB`,
      );
      lastMessage.content += " " + event.content;
      lastMessage.timestamp = now.toISOString(); // Refresh timestamp for consecutive merges
    } else {
      // Add as a new message
      this.state.messages.push({
        role: event.role,
        content: event.content,
        timestamp: now.toISOString(),
      });
    }

    // Update conversation in database
    if (this.state.conversationId) {
      await db
        .update(surveyConversations)
        .set({
          rawConversation: this.state.messages,
        })
        .where(eq(surveyConversations.id, this.state.conversationId));
    }

    // Update context with current messages
    if (this.state.surveyConfig && this.state.context) {
      this.state.context = await ConversationManager.loadOrCreateContext(
        this.identifier,
        this.state.messages.map((m) => ({ role: m.role, content: m.content })),
        this.state.surveyConfig,
      );

      // Save context to Redis for persistence
      await ConversationManager.saveContext(
        this.identifier,
        this.state.context,
      );

      // Send progress update to client
      this.send({
        type: "progress",
        completionPercentage: this.state.context.progress.completionPercentage,
        state: this.state.context.stateContext.currentState,
        shouldWrapUp: this.state.context.progress.shouldWrapUp,
      });
    }

    // Trigger async memory update after assistant messages (non-blocking)
    if (
      event.role === "assistant" &&
      this.state.surveyConfig &&
      this.state.context
    ) {
      ConversationManager.updateMemoryAsync(
        this.identifier,
        this.state.messages,
        this.state.surveyConfig,
        this.state.context,
      ).catch(console.error);
    }

    // Fallback completion detection via phrases
    if (event.role === "assistant") {
      const userMessages = this.state.messages.filter((m) => m.role === "user");
      const minQuestions = Math.max(
        this.state.surveyConfig?.requiredQuestions?.length || 0,
        3,
      );

      const isCompletionPhrase =
        event.content.toLowerCase().includes("thank you for completing") ||
        event.content.toLowerCase().includes("survey is now complete") ||
        event.content
          .toLowerCase()
          .includes("your feedback is incredibly valuable") ||
        event.content.toLowerCase().includes("thank you for your time") ||
        event.content.toLowerCase().includes("have a great day") ||
        event.content.toLowerCase().includes("goodbye") ||
        (this.state.context?.progress.shouldWrapUp &&
          event.content.length < 150);

      if (isCompletionPhrase && userMessages.length >= minQuestions) {
        console.log(
          `[Survey Response Voice] Phrase-based completion detected ` +
            `(messages: ${userMessages.length})`,
        );
        setTimeout(() => {
          this.send({ type: "survey_completed" });
          this.handleComplete();
        }, 3000);
      }
    }
  }

  protected async onFunctionCall(
    event: FunctionCallRequestEvent,
  ): Promise<void> {
    switch (event.function_name) {
      case "showMedia": {
        const mediaId = event.input?.mediaId;
        const media = this.state.surveyConfig?.media?.find(
          (m) => m.id === mediaId,
        );

        if (media) {
          this.send({
            type: "display_media",
            media: {
              id: media.id,
              type: media.type,
              url: media.url,
              description: media.description,
              altText: media.altText,
              durationMs: media.durationMs,
            },
          });
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({
              success: true,
              media: {
                id: media.id,
                type: media.type,
                description: media.description,
              },
            }),
          );
        } else {
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({ error: "Media not found" }),
          );
        }
        break;
      }

      case "finishSurvey": {
        const userMessages = this.state.messages.filter(
          (m) => m.role === "user",
        );
        const minQuestions = Math.max(
          this.state.surveyConfig?.requiredQuestions?.length || 0,
          3,
        );

        // Only complete if enough interaction happened
        if (userMessages.length >= minQuestions) {
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({
              success: true,
              message: "Survey marked as complete",
            }),
          );

          console.log(
            `[Survey Response Voice] Tool-based completion for ${this.state.conversationId} ` +
              `(messages: ${userMessages.length})`,
          );

          // Delay to let agent speak farewell
          setTimeout(() => {
            this.send({ type: "survey_completed" });
            this.handleComplete();
          }, 500);
        } else {
          // Not enough interaction yet — tell the agent to continue
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({
              error: "Cannot finish yet - more questions need to be covered",
              currentQuestions: userMessages.length,
              minimumRequired: minQuestions,
            }),
          );
        }
        break;
      }

      default:
        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify({ error: `Unknown function: ${event.function_name}` }),
        );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async handleControlMessage(message: any): Promise<void> {
    switch (message.type) {
      case "stop_speaking":
        // Voice Agent handles interruption internally
        break;

      case "complete":
        await this.handleComplete();
        break;
    }
  }

  // Removed buildFunctionDefinitions() - now using ConductingSpecialist.getDeepgramFunctions()

  /**
   * Handle completion of survey
   */
  private async handleComplete(): Promise<void> {
    try {
      // Mark conversation as completed
      if (this.state.conversationId) {
        await db
          .update(surveyConversations)
          .set({ completed: true })
          .where(eq(surveyConversations.id, this.state.conversationId));

        // Enqueue insights
        try {
          await enqueueConversationInsights({
            conversationId: this.state.conversationId,
            surveyId: this.state.survey?.id || "",
            userId: this.ownerId || "",
          });
          console.log(
            `[Survey Response Voice] Enqueued insights for ${this.state.conversationId}`,
          );
        } catch (error) {
          console.error(
            "[Survey Response Voice] Failed to enqueue insights:",
            error,
          );
        }

        // Cleanup Redis context on successful completion
        const redis = getRedisClient();
        await redis.del(getContextKey(this.identifier));
        await redis.del(getStartTimeKey(this.identifier));
      }

      // Calculate final session metrics
      const sessionDurationMs = Date.now() - this.sessionStartTime;

      // Estimate costs based on session duration (session-level tracking)
      const durationMinutes = sessionDurationMs / 60000;
      const estimatedSttCost = durationMinutes * ESTIMATED_STT_COST_PER_MINUTE;

      // Estimate TTS cost from total assistant characters
      const totalAssistantChars = this.state.messages
        .filter((m) => m.role === "assistant")
        .reduce((sum, m) => sum + m.content.length, 0);
      const estimatedTtsCost =
        totalAssistantChars * ESTIMATED_TTS_COST_PER_CHAR;
      const totalCost = estimatedSttCost + estimatedTtsCost;

      // Update voice session status with metrics
      await db
        .update(voiceSessions)
        .set({
          status: "completed",
          endedAt: new Date(),
          durationMs: sessionDurationMs,
          audioDurationMs: Math.round(this.activeDurationMs),
          totalCost: totalCost.toString(),
          sttCost: estimatedSttCost.toString(),
          ttsCost: estimatedTtsCost.toString(),
        })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));

      // Update conversation with precise duration
      if (this.state.conversationId) {
        await db
          .update(surveyConversations)
          .set({
            durationMs: sessionDurationMs,
            activeDurationMs: Math.round(this.activeDurationMs),
          })
          .where(eq(surveyConversations.id, this.state.conversationId));
      }

      this.send({
        type: "completed",
        conversationId: this.state.conversationId,
      });

      this.ws.close();
    } catch (error) {
      console.error("[Survey Response Voice] Completion error:", error);
      this.send({
        type: "error",
        error: "Failed to complete survey",
      });
    }
  }

  /**
   * Cleanup resources
   */
  protected async cleanup(): Promise<void> {
    // Prevent double cleanup
    if (this.cleanupStarted) {
      console.log(
        `[Survey Response Voice] Cleanup already in progress for session ${this.state.voiceSessionId}`,
      );
      return;
    }
    this.cleanupStarted = true;

    try {
      // Call base cleanup (closes Voice Agent, clears timeouts)
      await super.cleanup();

      // Calculate final session duration
      const sessionDurationMs = Date.now() - this.sessionStartTime;

      // Update session status and metrics
      const [session] = await db
        .select()
        .from(voiceSessions)
        .where(eq(voiceSessions.id, this.state.voiceSessionId));

      if (session) {
        const newStatus =
          session.status === "active" ? "abandoned" : session.status;

        // Clean up orphaned conversation if no messages were exchanged
        if (this.state.conversationId && this.state.messages.length === 0) {
          console.log(
            `[Survey Response Voice] Cleaning up orphaned conversation ${this.state.conversationId} (no messages)`,
          );
          await db
            .delete(surveyConversations)
            .where(eq(surveyConversations.id, this.state.conversationId));
        }

        // Estimate costs for session level tracking
        const durationMinutes = sessionDurationMs / 60000;
        const estimatedSttCost =
          durationMinutes * ESTIMATED_STT_COST_PER_MINUTE;
        const totalAssistantChars = this.state.messages
          .filter((m) => m.role === "assistant")
          .reduce((sum, m) => sum + m.content.length, 0);
        const estimatedTtsCost =
          totalAssistantChars * ESTIMATED_TTS_COST_PER_CHAR;
        const totalCost = estimatedSttCost + estimatedTtsCost;

        await db
          .update(voiceSessions)
          .set({
            status: newStatus,
            endedAt: new Date(),
            durationMs: sessionDurationMs,
            audioDurationMs: Math.round(this.activeDurationMs),
            totalCost: totalCost.toString(),
            sttCost: estimatedSttCost.toString(),
            ttsCost: estimatedTtsCost.toString(),
          })
          .where(eq(voiceSessions.id, this.state.voiceSessionId));

        // Update conversation with precise duration
        if (this.state.conversationId) {
          await db
            .update(surveyConversations)
            .set({
              durationMs: sessionDurationMs,
              activeDurationMs: Math.round(this.activeDurationMs),
            })
            .where(eq(surveyConversations.id, this.state.conversationId));
        }

        console.log(
          `[Survey Response Voice] Session ${this.state.voiceSessionId} cleaned up: ` +
            `duration=${sessionDurationMs}ms, activeDuration=${this.activeDurationMs}ms, ` +
            `estimatedCost=$${totalCost.toFixed(4)}`,
        );
      }
    } catch (error) {
      console.error("[Survey Response Voice] Cleanup error:", error);
    }
  }
}
