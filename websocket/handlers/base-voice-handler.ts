import { WebSocket } from "ws";
import { AudioBufferManager, AUDIO_CONFIG } from "@/lib/voice/audio-processing";
import {
  getGoogleSTTService,
  GoogleSTTStreamingSession,
  type TranscriptionResult,
  type VoiceActivityEvent,
} from "@/lib/voice/google-stt";
import { getTTSService } from "@/lib/voice/google-tts";
import { AuthenticatedConnection } from "../middleware/auth";
import {
  checkMessageAllowed,
  checkAudioChunkAllowed,
} from "../middleware/rate-limit";

// Configuration constants
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle timeout
const IDLE_WARNING_MS = 30 * 1000; // Warn 30 seconds before timeout
const SPEECH_PROCESSING_DELAY_MS = 800; // Wait 800ms after speech ends for final results

export abstract class BaseVoiceHandler {
  protected ws: WebSocket;
  protected userId?: string;
  protected identifier: string;
  protected audioBuffer: AudioBufferManager;
  protected sttService: ReturnType<typeof getGoogleSTTService>;
  protected sttSession: GoogleSTTStreamingSession | null = null;
  protected tts: ReturnType<typeof getTTSService>;
  protected isActive: boolean = true;
  
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


  constructor(
    ws: WebSocket,
    identifier: string,
    userId?: string
  ) {
    this.ws = ws;
    this.identifier = identifier;
    this.userId = userId;
    this.audioBuffer = new AudioBufferManager();
    this.sttService = getGoogleSTTService();
    this.tts = getTTSService();

    this.setupBaseConnectionHandlers();
    this.setupBaseMessageHandlers();
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  abstract initialize(): Promise<void>;
  abstract processUserMessage(text: string): Promise<void>;
  protected abstract getLanguage(): "en" | "fr" | "de";
  
  protected async handleControlMessage(message: any): Promise<void> {
    // Default implementation can be overridden
    if (message.type === "ping") {
      this.send({ type: "pong" });
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
    this.send({ type: "error", error: message, code });
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

      // Rate limit checks
      if (data.length > 10000) { // Large payload check
         // Assume audio or large JSON
      } else {
         const messageCheck = await checkMessageAllowed(this.identifier);
         if (!messageCheck.allowed) {
             this.send({
                 type: "rate_limit",
                 error: messageCheck.reason,
                 retryAfter: messageCheck.retryAfter
             });
             return;
         }
      }

      this.resetIdleTimeout();

      try {
        // Try to parse as JSON (control messages)
        const message = JSON.parse(data.toString());
        await this.handleControlMessage(message);
      } catch {
        // Not JSON, treat as audio data
        await this.handleAudioData(data);
      }
    });
  }

  /**
   * Handle incoming audio chunks
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
      if (this.sttSession) {
        this.sttSession.write(audioData);
      }


      // Buffer audio only if enabled and VAD detects speech
      if (this.enableAudioBuffering) {
          this.audioBuffer.addChunk(audioData, this.isSpeechActive);
      }
      
    } catch (error) {
      console.error(`[VoiceHandler] Audio processing error (${this.identifier}):`, error);
    }
  }

  /**
   * Initialize STT Session
   */
  protected initializeSTTSession(): void {
    if (!this.isActive) return;

    this.sttSession = this.sttService.createStreamingSession({
      language: this.getLanguage(),
      enableInterimResults: true,
      enableAutoPunctuation: true,
      speechEndTimeout: 1.5,
      singleUtterance: false,
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
          "Speech recognition is currently disabled. Please contact support or enable the Google Cloud Speech-to-Text API.",
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
        if (this.speechProcessingTimeout) {
          clearTimeout(this.speechProcessingTimeout);
          this.speechProcessingTimeout = null;
        }
        this.send({ type: "speech_start" });
        break;

      case "SPEECH_END":
      case "END_OF_UTTERANCE":
        this.isSpeechActive = false;
        this.send({ type: "speech_end" });

        if (this.speechProcessingTimeout) clearTimeout(this.speechProcessingTimeout);
        
        this.speechProcessingTimeout = setTimeout(() => {
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
    if (!text || this.isProcessing) return;

    this.pendingTranscription = "";
    this.isProcessing = true;

    try {
      await this.processUserMessage(text);
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
