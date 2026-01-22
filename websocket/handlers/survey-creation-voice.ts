import { WebSocket } from "ws";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  surveys,
  surveyCreationConversations,
  voiceSessions,
  voiceChunks,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { AuthenticatedConnection } from "../middleware/auth";
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
import { generateAIResponse } from "@/lib/ai";
import {
  getSurveyCreationSystemPrompt,
  type CollectedInfo,
  getSurveyDataExtractionPrompt,
} from "@/lib/prompts";
import {
  checkMessageAllowed,
  checkAudioChunkAllowed,
  checkTTSAllowed,
} from "../middleware/rate-limit";
import { UsageService } from "@/lib/billing/usage";
import { FeatureFlags } from "@/lib/flags";

// Configuration constants
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle timeout
const SPEECH_PROCESSING_DELAY_MS = 800; // Wait 800ms after speech ends for final results

/**
 * WebSocket Handler for Voice-Enabled Survey Creation
 * Handles real-time voice conversation for creating surveys
 * UPDATED: Now uses proper prompt system with collectedInfo tracking
 */

interface VoiceMessage {
  type: string;
  language?: "en" | "fr" | "de";
  [key: string]: unknown;
}

interface CreationState {
  surveyId: string | null;
  conversationId: string | null;
  voiceSessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  collectedInfo: CollectedInfo; // ← FIXED: Now uses proper type
  extractedData: Record<string, unknown>;
  isProcessing: boolean;
  language: "en" | "fr" | "de";
}

export class SurveyCreationVoiceHandler {
  private ws: WebSocket;
  private userId: string;
  private sessionId: string;
  private identifier: string; // For rate limiting
  private organizationId: string | null = null;
  private audioBuffer: AudioBufferManager;
  private state: CreationState;
  private sttService: ReturnType<typeof getGoogleSTTService>;
  private sttSession: GoogleSTTStreamingSession | null = null;
  private tts: ReturnType<typeof getTTSService>;
  private isActive: boolean = true;
  private pendingTranscription: string = "";
  private speechProcessingTimeout: NodeJS.Timeout | null = null;

  // VAD state tracking - tracks if Google STT detects speech
  private isSpeechActive: boolean = false;

  // Idle timeout management
  private idleTimeout: NodeJS.Timeout | null = null;
  private lastActivityTime: number = Date.now();

  // Session metrics
  private sessionStartTime: number = Date.now();
  private totalAudioDurationMs: number = 0;
  private totalSttCost: number = 0;
  private totalTtsCost: number = 0;

  constructor(connection: AuthenticatedConnection) {
    this.ws = connection.ws;
    this.userId = connection.userId;
    this.sessionId = connection.sessionId;
    this.identifier = `user:${connection.userId}`; // For rate limiting
    this.audioBuffer = new AudioBufferManager();
    this.sttService = getGoogleSTTService();
    this.tts = getTTSService();

    // FIXED: Initialize with proper CollectedInfo structure
    this.state = {
      surveyId: null,
      conversationId: null,
      voiceSessionId: nanoid(),
      messages: [],
      collectedInfo: {
        objective: false,
        targetAudience: false,
        scope: false,
        successCriteria: false,
        constraints: false,
        hypotheses: false,
        tone: false,
        additionalContext: false,
        requiredQuestions: false,
        metrics: false,
        personalInfo: false,
      },
      extractedData: {},
      isProcessing: false,
      language: "en",
    };

    this.setupMessageHandlers();
    this.setupConnectionHandlers();
  }

  /**
   * Initialize the handler
   */
  async initialize(): Promise<void> {
    // ✅ FIX: Check entitlement for voice survey creation
    try {
      const { assertCanCreateVoiceSurvey } = await import("../../lib/billing/entitlements");
      const { getActiveWorkspace } = await import("../../app/actions/workspace");
      
      // Get active workspace if available
      try {
        const workspaceResult = await getActiveWorkspace();
        if (workspaceResult.success && workspaceResult.data) {
          this.organizationId = workspaceResult.data.id;
        }
      } catch (error) {
        // Continue without workspace
      }
      
      // Feature Flag Check
      const canUseVoice = await FeatureFlags.isEnabled("voice_surveys", this.userId);
      if (!canUseVoice) {
         this.send({ type: "error", error: "Voice surveys are currently disabled or not available on your plan." });
         this.ws.close();
         return;
      }

      await assertCanCreateVoiceSurvey({
        userId: this.userId,
        organizationId: this.organizationId,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "PlanLimitError") {
        this.send({
          type: "error",
          error: error.message,
        });
        this.ws.close();
        return;
      }
      // Log other errors but continue
      console.error("[Survey Creation Voice] Entitlement check error:", error);
    }
    try {
      this.sessionStartTime = Date.now();

      // Create voice session in database
      await db.insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        userId: this.userId,
        sessionType: "survey_creation",
        status: "active",
        startedAt: new Date(),
      });

      // Initialize Google STT streaming session with built-in VAD
      this.initializeSTTSession();

      // Start idle timeout monitoring
      this.resetIdleTimeout();

      // Send ready message
      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
      });

      // Send welcome message
      await this.sendWelcomeMessage();
    } catch (error) {
      console.error("[Survey Creation Voice] Initialization error:", error);
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

    // Clear existing timeout
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }

    // Set new timeout
    this.idleTimeout = setTimeout(() => {
      this.handleIdleTimeout();
    }, IDLE_TIMEOUT_MS);
  }

  /**
   * Handle idle timeout - close session gracefully
   */
  private async handleIdleTimeout(): Promise<void> {
    console.log(
      `[Survey Creation Voice] Session ${this.state.voiceSessionId} idle timeout after ${IDLE_TIMEOUT_MS / 1000}s`
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
      console.error("[Survey Creation Voice] STT session error:", error);
      // Restart session on error
      this.restartSTTSession();
    });

    // Handle session end
    this.sttSession.on("end", () => {
      console.log("[Survey Creation Voice] STT session ended");
      // Restart session if still active
      if (this.isActive && !this.state.isProcessing) {
        this.restartSTTSession();
      }
    });

    // Handle max restarts reached
    this.sttSession.on("maxRestartsReached", (attempts: number) => {
      console.error(
        `[Survey Creation Voice] STT max restarts reached after ${attempts} attempts`
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
    console.log("[Survey Creation Voice] Google STT session started with VAD");
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
        // Max retries reached - notify client and close
        console.error(
          "[Survey Creation Voice] STT session restart failed after max attempts"
        );
        this.send({
          type: "error",
          error:
            "Voice recognition service unavailable. Please try again later.",
          code: "STT_RESTART_FAILED",
        });
        // Don't close the connection - allow text fallback
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
      // Note: Database cost tracking happens in processAccumulatedTranscription
      // This tracks session-level costs for monitoring
      if (result.cost > 0) {
        CostTracker.trackSTT(
          this.userId,
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
      console.error("[Survey Creation Voice] WebSocket error:", error);
      this.isActive = false;
    });
  }

  /**
   * Handle control messages
   */
  private async handleControlMessage(message: VoiceMessage): Promise<void> {
    switch (message.type) {
      case "start":
        await this.handleStart();
        break;

      case "stop_speaking":
        // User interrupted - stop current audio
        this.state.isProcessing = false;
        break;

      case "language":
        {
          const lang = message.language;
          if (lang === "en" || lang === "fr" || lang === "de") {
            this.state.language = lang;
          } else {
            this.state.language = "en";
          }
        }
        break;

      case "finalize":
        await this.handleFinalize();
        break;

      default:
        console.warn(
          "[Survey Creation Voice] Unknown message type:",
          message.type
        );
    }
  }

  /**
   * Handle start of survey creation
   */
  private async handleStart(): Promise<void> {
    // Prevent duplicate survey creation
    if (this.state.surveyId) {
      console.warn(
        `[Survey Creation Voice] Survey already created: ${this.state.surveyId}`
      );
      this.send({
        type: "already_started",
        surveyId: this.state.surveyId,
        conversationId: this.state.conversationId,
      });
      return;
    }

    try {
      // Create survey
      const surveyId = nanoid();
      const conversationId = nanoid();

      await db.insert(surveys).values({
        id: surveyId,
        userId: this.userId,
        title: "Untitled Survey",
        status: "creating",
        language: this.state.language,
      });

      await db.insert(surveyCreationConversations).values({
        id: conversationId,
        surveyId,
        messages: [],
        status: "in_progress",
        collectedInfo: this.state.collectedInfo,
        extractedData: {},
      });

      // Update voice session with survey ID
      await db
        .update(voiceSessions)
        .set({ surveyId, conversationId })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));

      this.state.surveyId = surveyId;
      this.state.conversationId = conversationId;

      this.send({
        type: "started",
        surveyId,
        conversationId,
      });

      // Track usage
      await UsageService.incrementUsage(
        this.userId, 
        this.organizationId, 
        "voiceSurveysCount"
      );
    } catch (error) {
      console.error("[Survey Creation Voice] Start error:", error);
      this.send({
        type: "error",
        error: "Failed to start survey creation",
      });
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
      // This saves memory by not buffering silence
      this.audioBuffer.addChunk(audioData, this.isSpeechActive);
    } catch (error) {
      console.error("[Survey Creation Voice] Audio processing error:", error);
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
      await this.generateResponse(transcriptionText);
    } catch (error) {
      console.error(
        "[Survey Creation Voice] Transcription processing error:",
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
   * Generate AI response
   * FIXED: Now uses proper prompt system with collectedInfo tracking
   */
  private async generateResponse(userMessage: string): Promise<void> {
    try {
      // FIXED: Get survey creation prompt with collectedInfo tracking
      const systemPrompt = getSurveyCreationSystemPrompt(
        this.state.collectedInfo,
        this.state.language
      );

      // Generate response
      const response = await generateAIResponse(userMessage, systemPrompt, {
        temperature: 0.7,
        maxTokens: 500,
      });

      // Add assistant message
      this.state.messages.push({
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
      });

      // FIXED: Extract and update collected information
      await this.updateCollectedInfo();

      // Update conversation in database
      if (this.state.conversationId) {
        await db
          .update(surveyCreationConversations)
          .set({
            messages: this.state.messages,
            collectedInfo: this.state.collectedInfo,
            extractedData: this.state.extractedData,
          })
          .where(eq(surveyCreationConversations.id, this.state.conversationId));
      }

      // FIXED: Send progress update to client
      this.send({
        type: "progress",
        collectedInfo: this.state.collectedInfo,
      });

      // Synthesize speech
      await this.synthesizeAndSendAudio(response);
    } catch (error) {
      console.error(
        "[Survey Creation Voice] Response generation error:",
        error
      );
      this.send({
        type: "error",
        error: "Failed to generate response",
      });
    }
  }

  /**
   * Extract and update collected information from conversation
   * FIXED: NEW METHOD - Extracts structured data like text conversations
   */
  private async updateCollectedInfo(): Promise<void> {
    try {
      // Use AI to analyze what information has been collected
      const extractionPrompt = getSurveyDataExtractionPrompt(
        this.state.messages
      );

      const extractedText = await generateAIResponse(
        extractionPrompt,
        undefined,
        {
          temperature: 0.3,
          maxTokens: 2000,
        }
      );

      // Parse extracted data
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Update collectedInfo flags
        if (parsed.collectedInfo) {
          this.state.collectedInfo = {
            ...this.state.collectedInfo,
            ...parsed.collectedInfo,
          };
        }

        // Update extracted data (excluding collectedInfo)
        const dataWithoutCollectedInfo = { ...parsed };
        delete (dataWithoutCollectedInfo as Record<string, unknown>)
          .collectedInfo;
        this.state.extractedData = {
          ...this.state.extractedData,
          ...dataWithoutCollectedInfo,
        };
      }
    } catch (error) {
      console.error("[Survey Creation Voice] Info extraction error:", error);
      // Continue without throwing - extraction is best-effort
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

      // Synthesize audio
      const synthesis = await this.tts.synthesizeForSurvey(
        text,
        "casual",
        this.state.language
      );

      if ("error" in synthesis) {
        console.error(
          "[Survey Creation Voice] Synthesis error:",
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
        this.userId,
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
      console.error("[Survey Creation Voice] Synthesis error:", error);
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
    const welcomeMessages = {
      en: "Hi! I'm here to help you create an AI-powered survey. Let's start by understanding what you want to learn. What's the goal of your survey?",
      fr: "Bonjour! Je suis là pour vous aider à créer une enquête alimentée par l'IA. Commençons par comprendre ce que vous voulez apprendre. Quel est l'objectif de votre enquête?",
      de: "Hallo! Ich bin hier, um Ihnen bei der Erstellung einer KI-gestützten Umfrage zu helfen. Lassen Sie uns damit beginnen zu verstehen, was Sie lernen möchten. Was ist das Ziel Ihrer Umfrage?",
    };

    const welcomeText = welcomeMessages[this.state.language];
    await this.synthesizeAndSendAudio(welcomeText);

    this.state.messages.push({
      role: "assistant",
      content: welcomeText,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle finalization of survey creation
   * FIXED: Now validates completeness before finalizing
   */
  private async handleFinalize(): Promise<void> {
    try {
      // Final extraction to ensure all data is captured
      await this.updateCollectedInfo();

      // FIXED: Validate that required information is collected
      const requiredFields: (keyof CollectedInfo)[] = [
        "objective",
        "targetAudience",
        "scope",
        "successCriteria",
        "constraints",
      ];

      const missingFields = requiredFields.filter(
        (field) => !this.state.collectedInfo[field]
      );

      if (missingFields.length > 0) {
        this.send({
          type: "error",
          error: `Missing required information: ${missingFields.join(", ")}. Please continue the conversation to provide these details.`,
          missingFields,
        });
        return;
      }

      // FIXED: Update conversation with final extracted data
      if (this.state.conversationId) {
        // First update the survey itself with the extracted data
        // This was the missing link causing the "empty config" bug
        if (this.state.surveyId) {
          const data = this.state.extractedData as any;
          
          // Construct updates
          const surveyUpdates: Record<string, any> = {
            status: "draft", // Ready for confirmation
            // Structured data
            objective: data.objective,
            targetAudience: data.targetAudience,
            scope: data.scope,
            successCriteria: data.successCriteria,
            constraints: data.constraints,
            hypotheses: data.hypotheses,
            // Simple fields
            tone: data.tone,
            additionalContext: data.additionalContext,
            metrics: data.metrics,
            personalInfo: data.personalInfo,
            requiredQuestions: data.requiredQuestions || [], 
          };

          // Only update title if relevant (basic "Untitled Survey" check? Or just overwrite)
          if (data.title) {
            surveyUpdates.title = data.title;
          }

          // Force language consistency
          surveyUpdates.language = this.state.language;

          await db
            .update(surveys)
            .set(surveyUpdates)
            .where(eq(surveys.id, this.state.surveyId));
        }

        await db
          .update(surveyCreationConversations)
          .set({
            status: "completed",
            messages: this.state.messages,
            collectedInfo: this.state.collectedInfo,
            extractedData: this.state.extractedData,
          })
          .where(eq(surveyCreationConversations.id, this.state.conversationId));
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
        type: "finalized",
        surveyId: this.state.surveyId,
        collectedInfo: this.state.collectedInfo,
      });

      this.ws.close();
    } catch (error) {
      console.error("[Survey Creation Voice] Finalization error:", error);
      this.send({
        type: "error",
        error: "Failed to finalize survey",
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
   */
  private async cleanup(): Promise<void> {
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
          `[Survey Creation Voice] Session ended: ${this.state.voiceSessionId}, ` +
            `sttCost=$${this.totalSttCost.toFixed(4)}, ttsCost=$${this.totalTtsCost.toFixed(4)}`
        );
      }

      // Cleanup Google STT session
      if (this.sttSession) {
        this.sttSession.destroy();
        this.sttSession = null;
      }
    } catch (error) {
      console.error("[Survey Creation Voice] Cleanup error:", error);
    }
  }
}
