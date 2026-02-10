import { surveys } from "@/db/schema";
import { WebSocket } from "ws";
import { AudioBufferManager} from "@/lib/voice/audio-processing";
import {
  getDeepgramSTTService,
  DeepgramSTTStreamingSession,
  type TranscriptionResult,
  type VoiceActivityEvent,
} from "@/lib/voice/deepgram-stt";
import { getDeepgramTTSService } from "@/lib/voice/deepgram-tts";
import {
  checkMessageAllowed,
  checkAudioChunkAllowed,
} from "../middleware/rate-limit";
import {
  createVoiceError,
  sendVoiceError,
} from "@/lib/voice/errors";

// Configuration constants
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle timeout
const IDLE_WARNING_MS = 30 * 1000; // Warn 30 seconds before timeout
const SPEECH_PROCESSING_DELAY_MS = 20; // Effectively immediate (min buffer for event loop)

export abstract class BaseVoiceHandler {
  protected ws: WebSocket;
  protected userId?: string;
  protected identifier: string;
  protected audioBuffer: AudioBufferManager;
  protected sttService: ReturnType<typeof getDeepgramSTTService>;
  protected sttSession: DeepgramSTTStreamingSession | null = null;
  protected tts: ReturnType<typeof getDeepgramTTSService>;
  protected isActive: boolean = true;
  
  // Audio configuration from client
  protected audioSampleRate: number = 48000; // Default to 48kHz, updated from client
  
  // Transcription state
  protected pendingTranscription: string = "";
  protected isSpeechActive: boolean = false;
  protected isProcessing: boolean = false;
  protected speechProcessingTimeout: NodeJS.Timeout | null = null;
  protected enableAudioBuffering: boolean = false;

  // Idle timeout state
  protected idleTimeout: NodeJS.Timeout | null = null;
  protected idleWarningTimeout: NodeJS.Timeout | null = null;
  protected lastActivityTime: number = Date.now();
  protected isRestarting: boolean = false;

  // Exact duration tracking
  protected activeDurationMs: number = 0;
  protected lastInteractionEndTime: number = Date.now();
  protected currentSpeechStartTime: number | null = null;
  protected readonly MAX_SILENCE_GAP_MS = 30 * 1000; // 30 seconds cap for silence


  constructor(
    ws: WebSocket,
    identifier: string,
    userId?: string
  ) {
    this.ws = ws;
    this.identifier = identifier;
    this.userId = userId;
    this.audioBuffer = new AudioBufferManager();
    this.sttService = getDeepgramSTTService();
    this.tts = getDeepgramTTSService();

    this.setupBaseConnectionHandlers();
    this.setupBaseMessageHandlers();
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  abstract initialize(): Promise<void>;
  abstract processUserMessage(text: string): Promise<void>;
  protected abstract getLanguage(): typeof surveys.$inferSelect.language;
  
  protected async handleControlMessage(message: any): Promise<void> {
    // Default implementation can be overridden
    if (message.type === "ping") {
      this.send({ type: "pong" });
    }
  }

  /**
   * Handle audio configuration from client
   */
  protected handleAudioConfig(config: { sampleRate: number; channels: number; encoding: string }): void {
    const newSampleRate = config.sampleRate || 48000;
    
    // Only process if sample rate actually changed
    if (this.audioSampleRate !== newSampleRate) {
        this.audioSampleRate = newSampleRate;
        console.log(`[VoiceHandler] Audio config update: ${this.audioSampleRate}Hz, ${config.channels}ch, ${config.encoding}`);
        
        // Reinitialize STT session with new sample rate if already active
        if (this.sttSession && this.sttSession.isActive) {
          console.log(`[VoiceHandler] Reinitializing STT with new sample rate: ${this.audioSampleRate}Hz`);
          this.restartSTTSession();
        }
    }
  }

  /**
   * Helper to send data over WebSocket
   */
  protected send(data: any): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  protected sendError(message: string, code?: string): void {
    // Try to map to known error code
    if (code) {
      const voiceError = createVoiceError(code as keyof typeof import("@/lib/voice/errors").VOICE_ERRORS, message);
      sendVoiceError(this.send.bind(this), voiceError);
    } else {
      this.send({ type: "error", error: message, code: code || "UNKNOWN_ERROR" });
    }
  }

  /**
   * Common Cleanup Logic
   */
  protected async cleanup(): Promise<void> {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.sttSession) {
      this.sttSession.end();
      this.sttSession = null;
    }

    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    if (this.idleWarningTimeout) clearTimeout(this.idleWarningTimeout);
    if (this.speechProcessingTimeout) clearTimeout(this.speechProcessingTimeout);
    
    // Subclasses can override to add more cleanup, but should call super.cleanup()
  }

  /**
   * Setup base connection handlers
   */
  private setupBaseConnectionHandlers(): void {
    this.ws.on("close", async () => {
      await this.cleanup();
    });

    this.ws.on("error", (error) => {
      console.error(`[VoiceHandler] WebSocket error (${this.identifier}):`, error);
      this.cleanup();
    });
  }

  /**
   * Setup base message handlers for audio and JSON
   */
  private setupBaseMessageHandlers(): void {
    this.ws.on("message", async (data: Buffer) => {
      if (!this.isActive) return;

      this.resetIdleTimeout();

      try {
        // Try to parse as JSON (control messages)
        const message = JSON.parse(data.toString());
        
        // Handle audio configuration from client
        if (message.type === 'audio_config') {
          this.handleAudioConfig(message);
          return;
        }
        
        // Rate limit checks for JSON messages
        const messageCheck = await checkMessageAllowed(this.identifier);
        if (!messageCheck.allowed) {
            this.send({
                type: "rate_limit",
                error: messageCheck.reason,
                retryAfter: messageCheck.retryAfter
            });
            return;
        }

        await this.handleControlMessage(message);
      } catch {
        // Not JSON, treat as audio data
        await this.handleAudioData(data);
      }
    });
  }

  /**
   * Handle incoming audio chunks
   * Now accepts raw 16-bit PCM audio directly from AudioWorklet (no transcoding needed)
   */
  protected async handleAudioData(audioData: Buffer): Promise<void> {
    if (this.isProcessing) return;

    // Check audio chunk rate limit
    const audioCheck = await checkAudioChunkAllowed(this.identifier);
    if (!audioCheck.allowed) {
        // Silent fail or low-cost error to avoid spamming
        return;
    }

    try {
      // Audio is already raw 16-bit PCM from AudioWorklet
      // Just validate it's not empty
      if (!audioData || audioData.length === 0) {
        return;
      }

      // Send PCM audio directly to Deepgram STT
      if (this.sttSession) {
        await this.sttSession.write(audioData);
      }

      // Buffer audio only if enabled and VAD detects speech
      if (this.enableAudioBuffering) {
          this.audioBuffer.addChunk(audioData, this.isSpeechActive);
      }
      
    } catch (error) {
      console.error(`[VoiceHandler] Audio processing error (${this.identifier}):`, error);
      const voiceError = createVoiceError("AUDIO_FORMAT_INVALID", error instanceof Error ? error.message : String(error));
      sendVoiceError(this.send.bind(this), voiceError);
    }
  }


  /**
   * Initialize Deepgram STT streaming session (via base class)
   */
  protected initializeSTTSession(): void {
    if (!this.isActive) return;

    const language = this.getLanguage();
    
    // Language-aware endpointing for optimal conversational flow:
    // - English (Flux): 1s - Flux has advanced turn detection built-in
    // - Other languages (Nova-3): 0.8s - Aggressive timeout for real-time feel
    // This creates a snappy, natural voice agent experience
    const speechEndTimeout = language === "en" ? 1.0 : 0.8;

    this.sttSession = this.sttService.createStreamingSession({
      language,
      enableInterimResults: true,
      enableAutoPunctuation: true,
      speechEndTimeout, // Language-optimized timeout
      sampleRate: this.audioSampleRate, // Use dynamic sample rate from client (48kHz)
      // Note: Deepgram handles continuous streaming via endpointing, no singleUtterance needed
    });

    this.sttSession.on("transcription", (result: TranscriptionResult) => {
      this.handleTranscriptionResult(result);
    });

    this.sttSession.on("voiceActivity", (event: VoiceActivityEvent) => {
      this.handleVoiceActivity(event);
    });

    this.sttSession.on("error", (error: any) => {
      console.error(`[VoiceHandler] STT error (${this.identifier}):`, error);
      
      // Categorize error using the service helper
      const mappedError = this.sttService.handleError(error);

      
      if (mappedError.code === "SERVICE_DISABLED") {
        this.sendError(
          "Speech recognition is currently disabled. Please contact support or check your Deepgram API configuration.",
          "STT_DISABLED"
        );
        return; // Don't restart on disabled service
      }

      if (mappedError.code === "UNAUTHENTICATED" || mappedError.code === "PERMISSION_DENIED") {
        this.sendError("Speech recognition authentication failed.", "STT_AUTH_FAILED");
        return;
      }

      // Automatically attempt restart for transient/retryable errors
      this.restartSTTSession();
    });


    this.sttSession.on("end", () => {
      if (this.isActive && !this.isProcessing) {
        this.restartSTTSession();
      }
    });

    this.sttSession.start();
  }

  /**
   * Restart STT Session
   */
  protected async restartSTTSession(): Promise<void> {
    if (!this.isActive || this.isRestarting) return;
    this.isRestarting = true;

    try {
      if (this.sttSession) {
        await this.sttSession.attemptRestart();
      } else {
        this.initializeSTTSession();
      }
    } finally {
      this.isRestarting = false;
    }
  }


  /**
   * Handle Voice Activity Events
   */
  protected handleVoiceActivity(event: VoiceActivityEvent): void {
    this.resetIdleTimeout();

    switch (event.type) {
      case "SPEECH_START":
        this.isSpeechActive = true;
        
        // Calculate gap since last interaction (User or AI)
        const now = Date.now();
        const gap = now - this.lastInteractionEndTime;
        if (gap > 0) {
            this.activeDurationMs += Math.min(gap, this.MAX_SILENCE_GAP_MS);
        }
        this.currentSpeechStartTime = now;

        if (this.speechProcessingTimeout) {
          clearTimeout(this.speechProcessingTimeout);
          this.speechProcessingTimeout = null;
        }
        this.send({ type: "speech_start" });
        break;

      case "SPEECH_END":
      case "END_OF_UTTERANCE":
        this.isSpeechActive = false;
        
        // Add speech duration
        if (this.currentSpeechStartTime) {
            const speechDuration = Date.now() - this.currentSpeechStartTime;
            this.activeDurationMs += speechDuration;
            this.currentSpeechStartTime = null;
        }
        this.lastInteractionEndTime = Date.now();

        this.send({ type: "speech_end" });
        console.log(`[VoiceHandler] Speech ended, will process transcription in ${SPEECH_PROCESSING_DELAY_MS}ms`);

        if (this.speechProcessingTimeout) clearTimeout(this.speechProcessingTimeout);
        
        this.speechProcessingTimeout = setTimeout(() => {
          console.log(`[VoiceHandler] Processing accumulated transcription now`);
          this.processAccumulatedTranscription();
        }, SPEECH_PROCESSING_DELAY_MS);
        break;
    }
  }

  /**
   * Handle Transcription Results
   */
  protected handleTranscriptionResult(result: TranscriptionResult): void {
    this.resetIdleTimeout();

    if (result.isFinal) {
      this.pendingTranscription += (this.pendingTranscription ? " " : "") + result.text;
      
      this.send({
        type: "transcription",
        text: result.text,
        isFinal: true,
        confidence: result.confidence
      });
    } else {
      this.send({
        type: "transcription_interim",
        text: result.text,
        stability: result.stability
      });
    }
  }

  /**
   * Process accumulated text when speech ends
   */
  protected async processAccumulatedTranscription(): Promise<void> {
    const text = this.pendingTranscription.trim();
    if (!text || this.isProcessing) {
      console.log(`[VoiceHandler] Skipping processing: text=${!!text}, isProcessing=${this.isProcessing}`);
      return;
    }

    console.log(`[VoiceHandler] Processing user message: "${text}"`);
    this.pendingTranscription = "";
    this.isProcessing = true;

    try {
      await this.processUserMessage(text);
      console.log(`[VoiceHandler] User message processed successfully`);
    } catch (error) {
      console.error(`[VoiceHandler] processing error (${this.identifier}):`, error);
      this.sendError("Failed to process message");
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Idle Timeout Management
   */
  protected resetIdleTimeout(): void {
    this.lastActivityTime = Date.now();

    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    if (this.idleWarningTimeout) clearTimeout(this.idleWarningTimeout);

    this.idleWarningTimeout = setTimeout(() => {
      this.send({
        type: "idle_warning",
        message: "Session will close in 30 seconds due to inactivity.",
        secondsRemaining: 30
      });
    }, IDLE_TIMEOUT_MS - IDLE_WARNING_MS);

    this.idleTimeout = setTimeout(() => {
        this.send({ type: "idle_timeout" });
        this.cleanup();
        this.ws.close(1000, "Idle timeout");
    }, IDLE_TIMEOUT_MS);
  }
}
