import { WebSocket } from "ws";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  surveys,
  surveyConversations,
  voiceSessions,
  voiceChunks,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { AudioBufferManager, AUDIO_CONFIG } from "@/lib/voice/audio-processing";
import {
  getGoogleSTTService,
  GoogleSTTStreamingSession,
  type TranscriptionResult,
  type VoiceActivityEvent,
  STT_COST_PER_MINUTE,
} from "@/lib/voice/google-stt";
import { getTTSService } from "@/lib/voice/google-tts";
import { CostTracker } from "@/lib/voice/cost-tracking";
import {
  getSurveyConversationSystemPrompt,
  type SurveyConfig,
} from "@/lib/prompts";
import { generateAIResponse, analysisModel } from "@/lib/ai";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import {
  checkMessageAllowed,
  checkAudioChunkAllowed,
  checkTTSAllowed,
} from "../middleware/rate-limit";
import {
  type RollingContext,
  createRollingContext,
  buildCompressedContext,
  calculateQualitySignals,
  detectParticipantStyle,
  calculateProgress,
  determineConversationState,
  getMemoryUpdatePrompt,
  applyMemoryUpdate,
  getContextKey,
  getStartTimeKey,
} from "@/lib/conversation-memory";
import { UsageService } from "@/lib/billing/usage";
import { getRedisClient } from "@/lib/redis";
import { enqueueConversationInsights } from "@/lib/queue";

// Configuration constants
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle timeout
const IDLE_WARNING_MS = 30 * 1000; // Warn 30 seconds before timeout
const SPEECH_PROCESSING_DELAY_MS = 800; // Wait 800ms after speech ends for final results

/**
 * WebSocket Handler for Voice-Enabled Survey Responses
 * Handles real-time voice conversation for survey takers
 */

interface VoiceMessage {
  type: string;
  language?: "en" | "fr" | "de";
  [key: string]: unknown;
}

interface ResponseState {
  surveyId: string;
  conversationId: string | null;
  voiceSessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  isProcessing: boolean;
  survey: typeof surveys.$inferSelect | null;
  language: "en" | "fr" | "de";
  // NEW: Conversation context for tracking progress
  context: RollingContext | null;
  surveyConfig: SurveyConfig | null;
}

export class SurveyResponseVoiceHandler {
  private ws: WebSocket;
  private surveyId: string;
  private identifier: string; // For rate limiting
  private audioBuffer: AudioBufferManager;
  private state: ResponseState;
  private sttService: ReturnType<typeof getGoogleSTTService>;
  private sttSession: GoogleSTTStreamingSession | null = null;
  private tts: ReturnType<typeof getTTSService>;
  private isActive: boolean = true;
  private participantId: string;
  private pendingTranscription: string = "";
  private speechProcessingTimeout: NodeJS.Timeout | null = null;

  // VAD state tracking - tracks if Google STT detects speech
  private isSpeechActive: boolean = false;

  // Idle timeout management
  private idleTimeout: NodeJS.Timeout | null = null;
  private idleWarningTimeout: NodeJS.Timeout | null = null;
  private lastActivityTime: number = Date.now();
  private cleanupStarted: boolean = false; // Issue 16: prevent double cleanup

  // Session metrics
  private sessionStartTime: number = Date.now();
  private totalAudioDurationMs: number = 0;
  private totalSttCost: number = 0;
  private totalTtsCost: number = 0;
  
  // Billing & State context
  private ownerId: string | null = null; // The survey owner (who pays)
  private organizationId: string | null = null;
  private memoryMutex: Promise<void> = Promise.resolve();

  constructor(ws: WebSocket, surveyId: string, identifier: string) {
    this.ws = ws;
    this.surveyId = surveyId;
    this.identifier = identifier; // For rate limiting
    this.participantId = nanoid(); // Generate anonymous participant ID
    this.audioBuffer = new AudioBufferManager();
    this.sttService = getGoogleSTTService();
    this.tts = getTTSService();

    this.state = {
      surveyId,
      conversationId: null,
      voiceSessionId: nanoid(),
      messages: [],
      isProcessing: false,
      survey: null,
      language: "en",
      context: null,
      surveyConfig: null,
    };

    this.setupMessageHandlers();
    this.setupConnectionHandlers();
  }

  /**
   * Initialize the handler
   */
  async initialize(): Promise<void> {
    try {
      // Load survey
      const [survey] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.shareableLink, this.surveyId));

      if (!survey) {
        this.send({
          type: "error",
          error: "Survey not found",
        });
        this.ws.close();
        return;
      }

      if (survey.status !== "active") {
        this.send({
          type: "error",
          error: "Survey is not active",
        });
        this.ws.close();
        return;
      }

      // ✅ FIX: Check plan-based concurrent participant limit
      try {
        const { assertCanAddVoiceParticipant } = await import("../../lib/billing/entitlements");
        const { getWorkspaceOwnerId } = await import("../../lib/workspace-access");
        
        // Get workspace owner for entitlement check
        let targetUserId = survey.userId;
        if (survey.organizationId) {
          const ownerId = await getWorkspaceOwnerId(survey.organizationId);
          if (ownerId) targetUserId = ownerId;
        }
        
        // Store for usage tracking
        this.ownerId = targetUserId;
        this.organizationId = survey.organizationId ?? null;

        await assertCanAddVoiceParticipant(
          { userId: targetUserId, organizationId: survey.organizationId ?? null },
          survey.currentParticipants
        );

        // Issue 8 Fix: Assert user can use voice and check session duration limits
        const { assertVoiceDurationAllowed } = await import("../../lib/billing/entitlements");
        await assertVoiceDurationAllowed(
          { userId: targetUserId, organizationId: survey.organizationId ?? null },
          1 // Start with 1 minute check to ensure they can at least start
        );
      } catch (error) {
        if (error instanceof Error && error.name === "PlanLimitError") {
          this.send({
            type: "error",
            error: error.message,
          });
          this.ws.close();
          return;
        }
        // Log but continue with survey's own limit check
        console.error("[Survey Response Voice] Entitlement check error:", error);
      }

      // Also check survey's own participant limit
      if (survey.currentParticipants >= survey.participantLimit) {
        this.send({
          type: "error",
          error: "Survey has reached participant limit",
        });
        this.ws.close();
        return;
      }

      this.state.survey = survey;
      this.state.language = survey.language;

      this.state.surveyConfig = buildCompleteSurveyConfig(survey);
      
      // Issue 3 Fix: Persistent memory tracking (Load from Redis or create new)
      const redis = getRedisClient();
      const contextKey = getContextKey(this.identifier); // Use identifier (session/ip) or conversation if known
      const startTimeKey = getStartTimeKey(this.identifier);
      
      const existingContext = await redis.get(contextKey);
      const startTimeStr = await redis.get(startTimeKey);
      const startTime = startTimeStr ? new Date(startTimeStr as string) : new Date();
      this.sessionStartTime = startTime.getTime();

      if (existingContext) {
        try {
          this.state.context = typeof existingContext === "string" 
            ? JSON.parse(existingContext) 
            : existingContext as RollingContext;
        } catch {
          this.state.context = createRollingContext(this.state.surveyConfig, startTime);
        }
      } else {
        this.state.context = createRollingContext(
          this.state.surveyConfig,
          startTime
        );
        await redis.set(startTimeKey, startTime.toISOString(), "EX", 7200);
      }

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
        rawConversation: [],
        completed: false,
      });

      this.state.conversationId = conversationId;

      // ✅ FIX: Use atomic SQL increment to prevent race condition
      await db
        .update(surveys)
        .set({
          currentParticipants: sql`current_participants + 1`,
        })
        .where(eq(surveys.id, survey.id));
        
      // Track usage (Response Count)
      // We charge the owner of the survey
      if (this.ownerId) {
          await UsageService.incrementUsage(
              this.ownerId,
              this.organizationId,
              "voiceResponsesCount"
          );
      }

      // Initialize Google STT streaming session with built-in VAD
      this.initializeSTTSession();

      // Start idle timeout monitoring
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
      this.send({
        type: "error",
        error: "Failed to initialize voice session",
      });
      this.ws.close();
    }
  }

  /**
   * Reset idle timeout - call on any activity
   */
  private resetIdleTimeout(): void {
    this.lastActivityTime = Date.now();

    // Clear existing timeouts
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    if (this.idleWarningTimeout) {
      clearTimeout(this.idleWarningTimeout);
      this.idleWarningTimeout = null;
    }

    // Issue 2 Fix: Set warning timeout first (30s before disconnect)
    this.idleWarningTimeout = setTimeout(() => {
      this.handleIdleWarning();
    }, IDLE_TIMEOUT_MS - IDLE_WARNING_MS);

    // Set main timeout
    this.idleTimeout = setTimeout(() => {
      this.handleIdleTimeout();
    }, IDLE_TIMEOUT_MS);
  }

  /**
   * Issue 2 Fix: Send warning 30 seconds before timeout
   */
  private handleIdleWarning(): void {
    console.log(
      `[Survey Response Voice] Session ${this.state.voiceSessionId} idle warning - 30s until timeout`
    );

    this.send({
      type: "idle_warning",
      message:
        "Are you still there? The session will close in 30 seconds due to inactivity.",
      secondsRemaining: 30,
    });
  }

  /**
   * Handle idle timeout - close session gracefully
   */
  private async handleIdleTimeout(): Promise<void> {
    console.log(
      `[Survey Response Voice] Session ${this.state.voiceSessionId} idle timeout after ${IDLE_TIMEOUT_MS / 1000}s`
    );

    this.send({
      type: "idle_timeout",
      message:
        "Session closed due to inactivity. Please reconnect to continue.",
    });

    // Clean up and close
    this.isActive = false;
    await this.cleanup();
    this.ws.close(1000, "Idle timeout");
  }

  /**
   * Initialize Google STT streaming session with VAD events
   */
  private initializeSTTSession(): void {
    // Create new streaming session with VAD configuration
    this.sttSession = this.sttService.createStreamingSession({
      language: this.state.language,
      enableInterimResults: true,
      enableAutoPunctuation: true,
      // VAD timeouts - wait 1.5s of silence before considering speech ended
      speechEndTimeout: 1.5,
      singleUtterance: false, // Keep stream open for continuous conversation
    });

    // Handle transcription results
    this.sttSession.on("transcription", (result: TranscriptionResult) => {
      this.handleTranscriptionResult(result);
    });

    // Handle voice activity events (built-in VAD)
    this.sttSession.on("voiceActivity", (event: VoiceActivityEvent) => {
      this.handleVoiceActivity(event);
    });

    // Handle errors
    this.sttSession.on("error", (error: Error) => {
      console.error("[Survey Response Voice] STT session error:", error);
      // Restart session on error
      this.restartSTTSession();
    });

    // Handle session end
    this.sttSession.on("end", () => {
      console.log("[Survey Response Voice] STT session ended");
      // Restart session if still active
      if (this.isActive && !this.state.isProcessing) {
        this.restartSTTSession();
      }
    });

    // Handle max restarts reached
    this.sttSession.on("maxRestartsReached", (attempts: number) => {
      console.error(
        `[Survey Response Voice] STT max restarts reached after ${attempts} attempts`
      );
      this.send({
        type: "warning",
        message:
          "Voice recognition is experiencing issues. You can continue with text input.",
        code: "STT_UNSTABLE",
      });
    });

    // Start the session
    this.sttSession.start();
    console.log("[Survey Response Voice] Google STT session started with VAD");
  }

  /**
   * Restart STT session with retry mechanism
   */
  private async restartSTTSession(): Promise<void> {
    if (!this.isActive) return;

    // Use the session's built-in retry mechanism
    if (this.sttSession) {
      const success = await this.sttSession.attemptRestart();

      if (!success) {
        // Max retries reached - notify client
        console.error(
          "[Survey Response Voice] STT session restart failed after max attempts"
        );
        this.send({
          type: "error",
          error:
            "Voice recognition service unavailable. Please try again later.",
          code: "STT_RESTART_FAILED",
        });
        return;
      }
    } else {
      // No existing session - create a new one
      this.initializeSTTSession();
    }
  }

  /**
   * Handle transcription results from Google STT
   */
  private handleTranscriptionResult(result: TranscriptionResult): void {
    // Reset idle timeout on transcription activity
    this.resetIdleTimeout();

    if (result.isFinal) {
      // Accumulate final transcription
      this.pendingTranscription +=
        (this.pendingTranscription ? " " : "") + result.text;

      // Track costs in Redis for rate limiting and analytics
      if (result.cost > 0) {
        CostTracker.trackSTT(
          this.participantId,
          result.cost,
          result.duration,
          this.state.voiceSessionId
        ).catch(console.error);
      }

      // Send final transcription to client
      this.send({
        type: "transcription",
        text: result.text,
        isFinal: true,
        confidence: result.confidence,
      });
    } else {
      // Send interim results for real-time feedback
      this.send({
        type: "transcription_interim",
        text: result.text,
        stability: result.stability,
      });
    }
  }

  /**
   * Handle voice activity events from Google STT's built-in VAD
   */
  private handleVoiceActivity(event: VoiceActivityEvent): void {
    // Reset idle timeout on any voice activity
    this.resetIdleTimeout();

    switch (event.type) {
      case "SPEECH_START":
        // Update VAD state - speech is now active
        this.isSpeechActive = true;

        // Clear any pending processing timeout
        if (this.speechProcessingTimeout) {
          clearTimeout(this.speechProcessingTimeout);
          this.speechProcessingTimeout = null;
        }
        this.send({ type: "speech_start" });
        break;

      case "SPEECH_END":
      case "END_OF_UTTERANCE":
        // Update VAD state - speech has ended
        this.isSpeechActive = false;

        this.send({ type: "speech_end" });

        // Wait a brief moment for final transcription, then process
        if (this.speechProcessingTimeout) {
          clearTimeout(this.speechProcessingTimeout);
        }
        this.speechProcessingTimeout = setTimeout(() => {
          this.processAccumulatedTranscription();
        }, SPEECH_PROCESSING_DELAY_MS);
        break;
    }
  }

  /**
   * Setup message handlers
   */
  private setupMessageHandlers(): void {
    this.ws.on("message", async (data: Buffer) => {
      // Check message rate limit
      const messageCheck = await checkMessageAllowed(this.identifier);
      if (!messageCheck.allowed) {
        this.send({
          type: "rate_limit",
          error: messageCheck.reason,
          retryAfter: messageCheck.retryAfter,
        });
        return;
      }

      try {
        // Try to parse as JSON (control messages)
        const message = JSON.parse(data.toString()) as VoiceMessage;
        await this.handleControlMessage(message);
      } catch {
        // Not JSON, treat as audio data
        await this.handleAudioData(data);
      }
    });
  }

  /**
   * Setup connection handlers
   */
  private setupConnectionHandlers(): void {
    this.ws.on("close", async () => {
      this.isActive = false;
      await this.cleanup();
    });

    this.ws.on("error", (error) => {
      console.error("[Survey Response Voice] WebSocket error:", error);
      this.isActive = false;
    });
  }

  /**
   * Handle control messages
   */
  private async handleControlMessage(message: VoiceMessage): Promise<void> {
    switch (message.type) {
      case "stop_speaking":
        // User interrupted - stop current audio
        this.state.isProcessing = false;
        break;

      case "complete":
        await this.handleComplete();
        break;

      default:
        console.warn(
          "[Survey Response Voice] Unknown message type:",
          message.type
        );
    }
  }

  /**
   * Handle incoming audio data
   */
  private async handleAudioData(audioData: Buffer): Promise<void> {
    if (!this.isActive || this.state.isProcessing) return;

    // Reset idle timeout on audio activity
    this.resetIdleTimeout();

    // Check audio chunk rate limit
    const audioCheck = await checkAudioChunkAllowed(this.identifier);
    if (!audioCheck.allowed) {
      this.send({
        type: "rate_limit",
        error: audioCheck.reason,
      });
      return;
    }

    try {
      // Stream audio directly to Google STT (VAD is handled by Google)
      if (this.sttSession) {
        const success = this.sttSession.write(audioData);
        if (!success) {
          // Session might have ended, restart it
          await this.restartSTTSession();
          // Try writing again after restart
          if (this.sttSession) {
            this.sttSession.write(audioData);
          }
        }
      }

      // Track audio duration using AUDIO_CONFIG constants
      const bytesPerSample = AUDIO_CONFIG.BIT_DEPTH / 8;
      const chunkDurationMs =
        (audioData.length /
          (AUDIO_CONFIG.SAMPLE_RATE * AUDIO_CONFIG.CHANNELS * bytesPerSample)) *
        1000;
      this.totalAudioDurationMs += chunkDurationMs;

      // Buffer for database storage - only buffer when speech is active (from Google STT VAD)
      this.audioBuffer.addChunk(audioData, this.isSpeechActive);
    } catch (error) {
      console.error("[Survey Response Voice] Audio processing error:", error);
    }
  }

  /**
   * Process accumulated transcription after speech ends
   */
  private async processAccumulatedTranscription(): Promise<void> {
    if (this.state.isProcessing) return;

    const transcriptionText = this.pendingTranscription.trim();
    if (!transcriptionText) return;

    // Clear pending transcription
    this.pendingTranscription = "";

    this.state.isProcessing = true;

    try {
      // Flush audio buffer for storage
      const audioBuffer = this.audioBuffer.flush();

      // Calculate duration using AUDIO_CONFIG constants
      const bytesPerSample = AUDIO_CONFIG.BIT_DEPTH / 8;
      const audioDurationMs = audioBuffer
        ? (audioBuffer.length /
            (AUDIO_CONFIG.SAMPLE_RATE *
              AUDIO_CONFIG.CHANNELS *
              bytesPerSample)) *
          1000
        : 0;

      // Calculate cost using the constant
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
          hadSpeech: true, // Only speech chunks are saved
          processingTimeMs: 0, // Streaming - no separate processing time
        });
      }

      // Add user message
      this.state.messages.push({
        role: "user",
        content: transcriptionText,
        timestamp: new Date().toISOString(),
      });

      // Generate AI response
      await this.generateResponse();
    } catch (error) {
      console.error(
        "[Survey Response Voice] Transcription processing error:",
        error
      );
      this.send({
        type: "error",
        error: "Failed to process transcription",
      });
    } finally {
      this.state.isProcessing = false;
    }
  }

  /**
   * Generate AI response with context awareness
   */
  private async generateResponse(): Promise<void> {
    try {
      if (!this.state.survey || !this.state.surveyConfig) {
        throw new Error("Survey data unavailable");
      }

      // Update context with current messages
      if (this.state.context) {
        const messagesForContext = this.state.messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        this.state.context = buildCompressedContext(
          messagesForContext,
          this.state.context
        );
        this.state.context.qualitySignals =
          calculateQualitySignals(messagesForContext);
        this.state.context.memory.participantStyle =
          detectParticipantStyle(messagesForContext);
        this.state.context.progress = calculateProgress(
          messagesForContext,
          this.state.surveyConfig,
          new Date(
            Date.now() - this.state.context.progress.elapsedMinutes * 60000
          ),
          this.state.context.memory.topicsCovered
        );
        this.state.context.stateContext = {
          ...this.state.context.stateContext,
          previousState: this.state.context.stateContext.currentState,
          currentState: determineConversationState(
            this.state.context.progress,
            messagesForContext.length,
            this.state.surveyConfig
          ),
        };
      }

      // Generate system prompt with context injection
      const systemPrompt = getSurveyConversationSystemPrompt(
        this.state.surveyConfig,
        this.state.language,
        this.state.context || undefined
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

      const response = await generateAIResponse(
        `Continue this conversation naturally. Latest message from participant: "${this.state.messages[this.state.messages.length - 1].content}"\n\nConversation so far:\n${conversationContext}`,
        systemPrompt,
        {
          temperature: 0.7,
          maxTokens: 500,
        }
      );

      // Add assistant message
      this.state.messages.push({
        role: "assistant",
        content: response,
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

      // Save context to Redis for persistence (Issue 3 Fix)
      if (this.state.context && this.state.conversationId) {
        const redis = getRedisClient();
        await redis.set(
            getContextKey(this.identifier), 
            JSON.stringify(this.state.context), 
            "EX", 7200
        );
      }

      // Synthesize speech
      await this.synthesizeAndSendAudio(response);
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
    if (this.state.messages.length < 4 || this.state.messages.length % 2 !== 0)
      return;

    try {
      const messagesForMemory = this.state.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const memoryPrompt = getMemoryUpdatePrompt(
        messagesForMemory,
        this.state.surveyConfig,
        this.state.context.memory
      );

      const memoryUpdateText = await generateAIResponse(
        memoryPrompt,
        undefined,
        {
          model: analysisModel,
          temperature: 0.3,
          maxTokens: 1000,
        }
      );

      const jsonMatch = memoryUpdateText.match(/\{[\s\S]*\}/);
      if (jsonMatch && this.state.context) {
        const update = JSON.parse(jsonMatch[0]);
        this.state.context.memory = applyMemoryUpdate(
          this.state.context.memory,
          update,
          this.state.surveyConfig
        );
      }
    } catch (error) {
      console.error("[Survey Response Voice] Memory update error:", error);
    }
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
  private send(message: Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Cleanup resources
   * Issue 16 Fix: Added idempotency guard to prevent double cleanup
   */
  private async cleanup(): Promise<void> {
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

      // Cleanup Google STT session
      if (this.sttSession) {
        this.sttSession.destroy();
        this.sttSession = null;
      }
    } catch (error) {
      console.error("[Survey Response Voice] Cleanup error:", error);
    }
  }
}
