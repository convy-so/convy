import { db } from "@/db";
import {
  surveys,
  surveyConversations,
  voiceSessions,
  voiceChunks,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { AUDIO_CONFIG } from "@/lib/voice/audio-processing";
import {
  STT_COST_PER_MINUTE,
} from "@/lib/voice/deepgram-stt";
import { CostTracker } from "@/lib/voice/cost-tracking";
import {
  type SurveyConfig,
} from "@/lib/prompts";
import { generateText, stepCountIs } from "ai";
import { selectModelForConversation, flashModel, flashLiteModel } from "@/lib/ai";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import {
  checkTTSAllowed,
} from "../middleware/rate-limit";
import {
  type RollingContext,
  getContextKey,
  getStartTimeKey,
} from "@/lib/conversation-memory";
import { enqueueConversationInsights } from "@/lib/queue";
import { UsageService } from "@/lib/billing/usage";
import { getRedisClient } from "@/lib/redis";
import { WebSocket } from "ws";
import { BaseVoiceHandler } from "./base-voice-handler";
import { ConversationManager } from "@/lib/conversation-manager";

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
  language: typeof surveys.$inferSelect.language;
  context: RollingContext | null;
  surveyConfig: SurveyConfig | null;
}

export class SurveyResponseVoiceHandler extends BaseVoiceHandler {
  private state: ResponseState;
  
  // Specific to response handler
  private participantId: string;
  private sessionStartTime: number = Date.now();
  private totalSttCost: number = 0;
  private totalTtsCost: number = 0;
  private totalAudioDurationMs: number = 0;
  private cleanupStarted: boolean = false;
  
  // Billing & State context
  private ownerId: string | null = null;
  private organizationId: string | null = null;

  constructor(ws: WebSocket, surveyId: string, identifier: string) {
    // Pass to base
    super(ws, identifier);
    
    this.participantId = nanoid();
    this.enableAudioBuffering = true;

    this.state = {
      surveyId,
      conversationId: null,
      voiceSessionId: nanoid(),
      messages: [],
      survey: null,
      language: "en",
      context: null,
      surveyConfig: null,
    };
  }

  async initialize(): Promise<void> {
    try {
      // Load survey
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

      // Check plan-based concurrent participant limit
      try {
        const { assertCanAddVoiceParticipant } = await import("../../lib/billing/entitlements");
        const { getWorkspaceOwnerId } = await import("../../lib/workspace-access");
        
        let targetUserId = survey.userId;
        if (survey.organizationId) {
          const ownerId = await getWorkspaceOwnerId(survey.organizationId);
          if (ownerId) targetUserId = ownerId;
        }
        
        this.ownerId = targetUserId;
        this.organizationId = survey.organizationId ?? null;

        await assertCanAddVoiceParticipant(
          { userId: targetUserId, organizationId: survey.organizationId ?? null },
          survey.currentParticipants
        );

        const { assertVoiceDurationAllowed } = await import("../../lib/billing/entitlements");
        await assertVoiceDurationAllowed(
          { userId: targetUserId, organizationId: survey.organizationId ?? null },
          1 // Start with 1 minute check
        );
      } catch (error) {
        if (error instanceof Error && error.name === "PlanLimitError") {
          this.sendError(error.message);
          this.ws.close();
          return;
        }
        console.error("[Survey Response Voice] Entitlement check error:", error);
      }

      if (survey.currentParticipants >= survey.participantLimit) {
        this.sendError("Survey has reached participant limit");
        this.ws.close();
        return;
      }

      this.state.survey = survey;
      this.state.language = survey.language;
      this.state.surveyConfig = buildCompleteSurveyConfig(survey);
      
      // Load or create context using Manager
      this.state.context = await ConversationManager.loadOrCreateContext(
        this.identifier,
        [], // No messages yet
        this.state.surveyConfig
      );

      // Restore start time from redis or use current
      const redis = getRedisClient();
      const startTimeKey = getStartTimeKey(this.identifier);
      const startTimeStr = await redis.get(startTimeKey);
      this.sessionStartTime = startTimeStr ? new Date(startTimeStr).getTime() : Date.now();

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
      });

      this.state.conversationId = conversationId;

      await db
        .update(surveys)
        .set({
          currentParticipants: sql`current_participants + 1`,
        })
        .where(eq(surveys.id, survey.id));
        
      // Track usage
      if (this.ownerId) {
          await UsageService.incrementUsage(
              this.ownerId,
              this.organizationId,
              "voiceResponsesCount"
          );
      }

      // Initialize Google STT streaming session (via base class)
      this.initializeSTTSession();
      
      // Start idle timeout (via base class)
      this.resetIdleTimeout();

      // Send ready message
      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
        conversationId,
        language: this.state.language,
      });

      // Send welcome message
      await this.sendWelcomeMessage();
    } catch (error) {
      console.error("[Survey Response Voice] Initialization error:", error);
      this.sendError("Failed to initialize voice session");
      this.ws.close();
    }
  }

  protected getLanguage(): typeof surveys.$inferSelect.language {
    return this.state.language;
  }

  protected async handleControlMessage(message: any): Promise<void> {
    await super.handleControlMessage(message);

    switch (message.type) {
      case "stop_speaking":
        this.isProcessing = false;
        break;

      case "complete":
        await this.handleComplete();
        break;
    }
  }

  // Override to handle cost tracking
  protected handleTranscriptionResult(result: import("@/lib/voice/deepgram-stt").TranscriptionResult): void {
      super.handleTranscriptionResult(result);
      
      if (result.isFinal && result.cost > 0) {
        CostTracker.trackSTT(
          this.participantId,
          result.cost,
          result.duration,
          this.state.voiceSessionId
        ).catch(console.error);
      }
  }

  // Override to handle audio buffering logic specifics
  protected async processAccumulatedTranscription(): Promise<void> {
    const transcriptionText = this.pendingTranscription.trim();
    if (!transcriptionText || this.isProcessing) return;

    // Clear pending transcription immediately
    this.pendingTranscription = "";
    this.isProcessing = true;

    try {
      // Flush audio buffer for storage
      const audioBuffer = this.audioBuffer.flush();

      // Calculate duration/cost
      const bytesPerSample = AUDIO_CONFIG.BIT_DEPTH / 8;
      const audioDurationMs = audioBuffer
        ? (audioBuffer.length /
            (AUDIO_CONFIG.SAMPLE_RATE *
              AUDIO_CONFIG.CHANNELS *
              bytesPerSample)) *
          1000
        : 0;

      const chunkCost = (audioDurationMs / 60000) * STT_COST_PER_MINUTE;
      this.totalSttCost += chunkCost;

      // Save audio chunk to database
      if (audioBuffer) {
        await db.insert(voiceChunks).values({
          id: nanoid(),
          sessionId: this.state.voiceSessionId,
          chunkType: "audio_in",
          durationMs: Math.round(audioDurationMs),
          sizeBytes: audioBuffer.length,
          transcription: transcriptionText,
          cost: chunkCost.toString(),
          hadSpeech: true, 
          processingTimeMs: 0,
        });
      }

      await this.processUserMessage(transcriptionText);
    } catch (error) {
       console.error("[Survey Response Voice] processing error:", error);
       this.sendError("Failed to process conversation");
    } finally {
       this.isProcessing = false;
    }
  }

  async processUserMessage(text: string): Promise<void> {
     // Add user message
      this.state.messages.push({
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      });

      // Generate AI response
      await this.generateResponse();
  }

  /**
   * Generate AI response with context awareness
   */
  private async generateResponse(): Promise<void> {
    try {
      if (!this.state.survey || !this.state.surveyConfig) {
        throw new Error("Survey data unavailable");
      }

      // Update context with current messages using Manager
      // This handles compression, quality signals, and progress tracking
      if (this.state.context) {
        this.state.context = await ConversationManager.loadOrCreateContext(
          this.identifier,
          this.state.messages.map((m) => ({ role: m.role, content: m.content })),
          this.state.surveyConfig
        );
      }

      // Generate system prompt with context injection using Manager
      const systemPrompt = ConversationManager.getSystemPrompt(
        this.state.surveyConfig,
        this.state.context!, // Only null if not initialized, which shouldn't happen here
        { language: this.state.language }
      );

      // Use compressed recent messages for generation
      const messagesForAI = this.state.context?.recentMessages.length
        ? this.state.context.recentMessages
        : this.state.messages.map((m) => ({
            role: m.role,
            content: m.content,
          }));

      // Generate response using conversation history
      const conversationContext = messagesForAI
        .map(
          (m) => `${m.role === "user" ? "Participant" : "You"}: ${m.content}`
        )
        .join("\n");

      // Define tools for voice agent using Manager
      const tools = ConversationManager.getTools(
        this.state.surveyConfig,
        (media) => {
            // Side effect: Send WS message to client to display media
            this.send({
              type: "display_media",
              media: {
                id: media.id,
                type: media.type,
                url: media.url,
                description: media.description,
                altText: media.altText,
                durationMs: media.durationMs,
              }
            });
            console.log(`[Survey Response Voice] Displaying media ${media.id}`);
        }
      );

      // Intelligent model selection: use flash-lite for conversation, flash for completion
      const userMessages = this.state.messages.filter(m => m.role === "user");
      const minQuestions = Math.max(this.state.surveyConfig.requiredQuestions?.length || 0, 3);
      const selectedModel = selectModelForConversation(this.state.context!, userMessages.length, minQuestions);
      
      console.log(`[Voice Model] Using:`, selectedModel === flashModel ? 'flash' : 'flash-lite');

      const { text: responseText, toolCalls } = await generateText({
        model: selectedModel,  // Use dynamically selected model
        system: systemPrompt,
        messages: [
          { role: "user", content: `Continue this conversation naturally. Latest message from participant: "${this.state.messages[this.state.messages.length - 1].content}"\n\nConversation so far:\n${conversationContext}` }
        ],
        temperature: 0.7,
        maxOutputTokens: 1000,  // Increased to allow AI to complete thought and call finishSurvey tool
        tools,
        stopWhen: stepCountIs(5), // Allow tool use loop with AI SDK v6
      });

      // Add assistant message
      this.state.messages.push({
        role: "assistant",
        content: responseText,
        timestamp: new Date().toISOString(),
      });

      // Update conversation in database
      if (this.state.conversationId) {
        await db
          .update(surveyConversations)
          .set({
            rawConversation: this.state.messages,
          })
          .where(eq(surveyConversations.id, this.state.conversationId));
      }

      // Check if AI called finishSurvey tool (primary detection method)
      // Check all steps because the tool call might happen in an earlier step
      const finishSurveyCall = toolCalls?.find((call: any) => 
          call.toolName === 'finishSurvey'
      );
      // Also keep string-based detection as fallback
      const isCompletionPhrase = responseText.toLowerCase().includes("thank you for completing") ||
          responseText.toLowerCase().includes("survey is now complete") ||
          responseText.toLowerCase().includes("your feedback is incredibly valuable") ||
          (this.state.context?.progress.shouldWrapUp && responseText.length < 150);

      const hasToolCompletion = !!finishSurveyCall;
      
      // Only mark complete if we have a reasonable amount of interaction
      const isCompleted = (hasToolCompletion || isCompletionPhrase) && userMessages.length >= minQuestions;
      
      // Send progress update to client
      if (this.state.context) {
        this.send({
          type: "progress",
          completionPercentage:
            this.state.context.progress.completionPercentage,
          state: this.state.context.stateContext.currentState,
          shouldWrapUp: this.state.context.progress.shouldWrapUp,
        });
      }

      // Save context to Redis for persistence using Manager
      if (this.state.context && this.state.conversationId) {
        await ConversationManager.saveContext(this.identifier, this.state.context);
      }

      // Synthesize speech first so the user hears the goodbye
      await this.synthesizeAndSendAudio(responseText);

      // If completed via tool call or phrase, signal the client and close
      if (isCompleted) {
        console.log(`[Survey Response Voice] completion detected for ${this.state.conversationId}` +
                    ` (tool: ${hasToolCompletion}, phrase: ${isCompletionPhrase}, messages: ${userMessages.length})`);
        // Small delay to ensure audio message is received/processed by client
        setTimeout(async () => {
             this.send({ type: "survey_completed" });
             await this.handleComplete();
        }, 2000); 
      }

    } catch (error) {
      console.error(
        "[Survey Response Voice] Response generation error:",
        error
      );
      this.send({
        type: "error",
        error: "Failed to generate response",
      });
    }
  }

  /**
   * Update conversation memory asynchronously
   */
  private async updateMemoryAsync(): Promise<void> {
    if (!this.state.context || !this.state.surveyConfig) return;
    
    // Delegate to Manager
    await ConversationManager.updateMemoryAsync(
        this.identifier, 
        this.state.messages, 
        this.state.surveyConfig, 
        this.state.context
    );
  }

  /**
   * Synthesize text to speech and send to client
   */
  private async synthesizeAndSendAudio(text: string): Promise<void> {
    // Check TTS rate limit
    const ttsCheck = await checkTTSAllowed(this.identifier);
    if (!ttsCheck.allowed) {
      // Fall back to text-only response
      this.send({
        type: "text_response",
        text,
        reason: "rate_limit",
      });
      return;
    }

    try {
      const startTime = Date.now();

      // Get survey tone
      const tone = this.state.survey
        ? this.state.survey.tone || "casual"
        : "casual";

      // Synthesize audio
      const synthesis = await this.tts.synthesizeForSurvey(
        text,
        tone,
        this.state.language
      );

      if ("error" in synthesis) {
        console.error(
          "[Survey Response Voice] Synthesis error:",
          synthesis.error
        );
        // Fall back to text response
        this.send({
          type: "text_response",
          text,
        });
        return;
      }

      const processingTime = Date.now() - startTime;

      // Track costs (both in Redis and locally)
      this.totalTtsCost += synthesis.cost;

      await CostTracker.trackTTS(
        this.participantId,
        synthesis.cost,
        synthesis.characterCount,
        this.state.voiceSessionId
      );

      // Save audio chunk
      await db.insert(voiceChunks).values({
        id: nanoid(),
        sessionId: this.state.voiceSessionId,
        chunkType: "audio_out",
        durationMs: Math.round(synthesis.duration),
        sizeBytes: synthesis.audio.length,
        synthesisText: text,
        cost: synthesis.cost.toString(),
        processingTimeMs: processingTime,
      });

      // Update active duration tracking with AI speech duration
      this.activeDurationMs += synthesis.duration;
      // Advance the last interaction time to when the AI will finish speaking
      this.lastInteractionEndTime = Date.now() + synthesis.duration;

      // Send audio to client
      this.send({
        type: "audio",
        audio: synthesis.audio.toString("base64"),
        text,
      });
    } catch (error) {
      console.error("[Survey Response Voice] Synthesis error:", error);
      this.send({
        type: "text_response",
        text,
      });
    }
  }

  /**
   * Send welcome message
   */
  private async sendWelcomeMessage(): Promise<void> {
    const welcomeText =
      (this.state.survey as { welcomeMessage?: string } | null)
        ?.welcomeMessage || this.getDefaultWelcomeMessage();

    await this.synthesizeAndSendAudio(welcomeText);

    this.state.messages.push({
      role: "assistant",
      content: welcomeText,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get default welcome message based on language
   */
  private getDefaultWelcomeMessage(): string {
    const messages = {
      en: "Hello! Thank you for participating in this survey. I'd love to hear your thoughts. Let's get started!",
      fr: "Bonjour! Merci de participer à cette enquête. J'aimerais connaître votre avis. Commençons!",
      de: "Hallo! Vielen Dank für Ihre Teilnahme an dieser Umfrage. Ich würde gerne Ihre Meinung hören. Lassen Sie uns beginnen!",
      es: "¡Hola! Gracias por participar en esta encuesta. Me encantaría conocer tus opiniones. ¡Empecemos!",
      it: "Ciao! Grazie per aver partecipato a questo sondaggio. Mi piacerebbe conoscere la tua opinione. Iniziamo!",
    };
    return messages[this.state.language];
  }

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

        // Issue 1 Fix: Enqueue insights for voice response
        try {
          await enqueueConversationInsights({
            conversationId: this.state.conversationId,
            surveyId: this.state.survey?.id || "",
            userId: this.ownerId || "",
          });
          console.log(`[Survey Response Voice] Enqueued insights for ${this.state.conversationId}`);
        } catch (error) {
          console.error("[Survey Response Voice] Failed to enqueue insights:", error);
        }
        
        // Cleanup Redis context on successful completion
        const redis = getRedisClient();
        await redis.del(getContextKey(this.identifier));
        await redis.del(getStartTimeKey(this.identifier));
      }

      // Calculate final session metrics
      const sessionDurationMs = Date.now() - this.sessionStartTime;

      // Update voice session status with metrics
      await db
        .update(voiceSessions)
        .set({
          status: "completed",
          endedAt: new Date(),
          durationMs: sessionDurationMs,
          audioDurationMs: Math.round(this.totalAudioDurationMs),
          totalCost: (this.totalSttCost + this.totalTtsCost).toString(),
          sttCost: this.totalSttCost.toString(),
          ttsCost: this.totalTtsCost.toString(),
        })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));

       // Update conversation with precise duration
       if (this.state.conversationId) {
          await db
            .update(surveyConversations)
            .set({ 
                durationMs: sessionDurationMs,
                activeDurationMs: Math.round(this.activeDurationMs)
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
   * Send message to client
   */


  /**
   * Cleanup resources
   * Issue 16 Fix: Added idempotency guard to prevent double cleanup
   */
  protected async cleanup(): Promise<void> {
    // Issue 16: Prevent double cleanup which can cause memory corruption
    if (this.cleanupStarted) {
      console.log(`[Survey Response Voice] Cleanup already in progress for session ${this.state.voiceSessionId}`);
      return;
    }
    this.cleanupStarted = true;
    
    try {
      // Clear any pending timeouts
      if (this.speechProcessingTimeout) {
        clearTimeout(this.speechProcessingTimeout);
        this.speechProcessingTimeout = null;
      }

      // Clear idle timeout
      if (this.idleTimeout) {
        clearTimeout(this.idleTimeout);
        this.idleTimeout = null;
      }
      
      // Clear idle warning timeout (Issue 2 related)
      if (this.idleWarningTimeout) {
        clearTimeout(this.idleWarningTimeout);
        this.idleWarningTimeout = null;
      }

      // Process any remaining transcription
      if (this.pendingTranscription.trim()) {
        await this.processAccumulatedTranscription();
      }

      // Clear audio buffer to free memory
      this.audioBuffer.clear();

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
            `[Survey Response Voice] Cleaning up orphaned conversation ${this.state.conversationId} (no messages)`
          );
          await db
            .delete(surveyConversations)
            .where(eq(surveyConversations.id, this.state.conversationId));
        }

        await db
          .update(voiceSessions)
          .set({
            status: newStatus,
            endedAt: new Date(),
            durationMs: sessionDurationMs,
            audioDurationMs: Math.round(this.totalAudioDurationMs),
            totalCost: (this.totalSttCost + this.totalTtsCost).toString(),
            sttCost: this.totalSttCost.toString(),
            ttsCost: this.totalTtsCost.toString(),
          })
          .where(eq(voiceSessions.id, this.state.voiceSessionId));

        // Update conversation with precise duration
        if (this.state.conversationId) {
            await db
            .update(surveyConversations)
            .set({ 
                durationMs: sessionDurationMs,
                activeDurationMs: Math.round(this.activeDurationMs)
            })
            .where(eq(surveyConversations.id, this.state.conversationId));
        }

        console.log(
          `[Survey Response Voice] Session ${this.state.voiceSessionId} cleaned up: ` +
            `duration=${sessionDurationMs}ms, audioDuration=${this.totalAudioDurationMs}ms, ` +
            `sttCost=$${this.totalSttCost.toFixed(4)}, ttsCost=$${this.totalTtsCost.toFixed(4)}`
        );
        
        // Track usage (Minutes)
        // We charge the owner of the survey
        if (this.ownerId) {
             const minutes = this.totalAudioDurationMs / 60000;
             if (minutes > 0) {
                 await UsageService.incrementUsage(
                    this.ownerId,
                    this.organizationId,
                    "voiceMinutesUsed",
                    minutes
                 );
             }
        }
      }

      // Cleanup Deepgram STT session
      if (this.sttSession) {
        this.sttSession.destroy();
        this.sttSession = null;
      }
    } catch (error) {
      console.error("[Survey Response Voice] Cleanup error:", error);
    }
  }
}
