
import * as speech from "@google-cloud/speech";
import { env } from "@/lib/env";
import { EventEmitter } from "events";
import { AUDIO_CONFIG, validateAudioBuffer } from "./audio-processing";

/**
 * Google Cloud Speech-to-Text Service with Built-in VAD
 * Uses streaming recognition with voice activity detection for real-time transcription
 * Cost: $0.016 per minute for standard recognition
 */

// Cost constant for reuse
export const STT_COST_PER_MINUTE = 0.016;

export interface GoogleSTTConfig {
  language?: string; // BCP-47 code (e.g., 'en-US', 'fr-FR', 'de-DE')
  enableInterimResults?: boolean;
  enableAutoPunctuation?: boolean;
  maxAlternatives?: number;
  // VAD Configuration
  speechStartTimeout?: number; // Duration to wait for speech to begin (seconds)
  speechEndTimeout?: number; // Duration to wait after speech ends (seconds)
  singleUtterance?: boolean; // Close stream after detecting end of speech
}

export interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  confidence: number;
  language?: string;
  duration: number; // milliseconds
  cost: number;
  stability?: number; // 0.0 to 1.0 for interim results
}

export interface TranscriptionError {
  error: string;
  code: string;
  retryable: boolean;
}

export interface VoiceActivityEvent {
  type: "SPEECH_START" | "SPEECH_END" | "END_OF_UTTERANCE";
  timestamp: number;
}

// Language code mapping for BCP-47
const LANGUAGE_CODES: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  de: "de-DE",
};

/**
 * Check if Google Cloud credentials are properly configured
 * Throws an error with helpful message if not configured
 */
export function validateGoogleCloudCredentials(): void {
  const hasCredentialsFile = !!env.GOOGLE_APPLICATION_CREDENTIALS;
  const hasProjectId = !!env.GOOGLE_CLOUD_PROJECT_ID;

  // At minimum, we need either explicit credentials or we're running on GCP
  // For explicit local development, we require GOOGLE_APPLICATION_CREDENTIALS
  if (!hasCredentialsFile && !hasProjectId) {
    throw new Error(
      `Google Cloud credentials not configured. Voice features require either:
      1. GOOGLE_APPLICATION_CREDENTIALS - Path to service account JSON key file (recommended for local dev)
      2. GOOGLE_CLOUD_PROJECT_ID - Project ID when using Application Default Credentials (for GCP deployment)
      
      Please set these environment variables and ensure the service account has 'Cloud Speech-to-Text API User' role.
      See .env.example for configuration details.`
    );
  }

  console.log(
    `[Google STT] Credentials configured: file=${hasCredentialsFile}, projectId=${hasProjectId}`
  );
}

/**
 * Google Cloud STT Service with Streaming and Built-in VAD
 */
export class GoogleSTTService extends EventEmitter {
  private client: speech.SpeechClient;
  private totalCost: number = 0;
  private totalDuration: number = 0;
  private requestCount: number = 0;
  private isInitialized: boolean = false;

  constructor() {
    super();
    // Validate credentials before initializing
    validateGoogleCloudCredentials();

    // Initialize with credentials from environment
    const config: { keyFilename?: string; projectId?: string } = {};

    if (env.GOOGLE_APPLICATION_CREDENTIALS) {
      config.keyFilename = env.GOOGLE_APPLICATION_CREDENTIALS;
    }

    if (env.GOOGLE_CLOUD_PROJECT_ID) {
      config.projectId = env.GOOGLE_CLOUD_PROJECT_ID;
    }

    this.client = new speech.SpeechClient(config);
    this.isInitialized = true;
    console.log("[Google STT] Service initialized successfully");
  }

  /**
   * Check if service is properly initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Create a streaming recognition session with built-in VAD
   * Returns a duplex stream for real-time audio processing
   */
  createStreamingSession(
    config: GoogleSTTConfig = {}
  ): GoogleSTTStreamingSession {
    const languageCode =
      LANGUAGE_CODES[config.language || "en"] || config.language || "en-US";

    const streamingConfig: speech.protos.google.cloud.speech.v1.IStreamingRecognitionConfig =
      {
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: AUDIO_CONFIG.SAMPLE_RATE,
          languageCode,
          enableAutomaticPunctuation: config.enableAutoPunctuation ?? true,
          maxAlternatives: config.maxAlternatives ?? 1,
          model: "latest_long", // Best for longer audio, supports streaming
          useEnhanced: true, // Enhanced model for better accuracy
        },
        interimResults: config.enableInterimResults ?? true,
        singleUtterance: config.singleUtterance ?? false,
      };

    // Add voice activity timeout configuration if specified
    if (config.speechStartTimeout || config.speechEndTimeout) {
      streamingConfig.voiceActivityTimeout = {};
      
      if (config.speechStartTimeout) {
        const seconds = Math.floor(config.speechStartTimeout);
        const nanos = Math.floor((config.speechStartTimeout - seconds) * 1e9);
        streamingConfig.voiceActivityTimeout.speechStartTimeout = {
          seconds,
          nanos,
        };
      }
      
      if (config.speechEndTimeout) {
        const seconds = Math.floor(config.speechEndTimeout);
        const nanos = Math.floor((config.speechEndTimeout - seconds) * 1e9);
        streamingConfig.voiceActivityTimeout.speechEndTimeout = {
          seconds,
          nanos,
        };
      }
    }

    return new GoogleSTTStreamingSession(this.client, streamingConfig, this);
  }

  /**
   * Transcribe a complete audio buffer (non-streaming)
   * Useful for processing pre-recorded audio chunks
   */
  async transcribe(
    audioBuffer: Buffer,
    config: GoogleSTTConfig = {}
  ): Promise<TranscriptionResult | TranscriptionError> {
    try {
      const languageCode =
        LANGUAGE_CODES[config.language || "en"] || config.language || "en-US";

      const startTime = Date.now();

      // Calculate duration for cost tracking
      const durationMs =
        (audioBuffer.length /
          (AUDIO_CONFIG.SAMPLE_RATE * AUDIO_CONFIG.CHANNELS * 2)) *
        1000;
      const durationMinutes = durationMs / 60000;

      const request: speech.protos.google.cloud.speech.v1.IRecognizeRequest = {
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: AUDIO_CONFIG.SAMPLE_RATE,
          languageCode,
          enableAutomaticPunctuation: config.enableAutoPunctuation ?? true,
          maxAlternatives: config.maxAlternatives ?? 1,
          model: "latest_long",
          useEnhanced: true,
        },
        audio: {
          content: audioBuffer.toString("base64"),
        },
      };

      const [response] = await this.client.recognize(request);
      const processingTime = Date.now() - startTime;

      // Extract transcription from response
      const transcription = response.results
        ?.map((result) => result.alternatives?.[0]?.transcript || "")
        .join(" ")
        .trim();

      const confidence =
        response.results?.[0]?.alternatives?.[0]?.confidence || 0;

      // Calculate cost: $0.016 per minute (Standard recognition)
      const cost = durationMinutes * 0.016;
      this.totalCost += cost;
      this.totalDuration += durationMs;
      this.requestCount++;

      console.log(
        `[Google STT] Transcribed ${durationMinutes.toFixed(2)} minutes in ${processingTime}ms - Cost: $${cost.toFixed(4)}`
      );

      return {
        text: transcription || "",
        isFinal: true,
        confidence,
        language: languageCode,
        duration: durationMs,
        cost,
      };
    } catch (error) {
      console.error("[Google STT] Transcription error:", error);
      return this.handleError(error);
    }
  }

  /**
   * Transcribe with context from previous conversation
   * Uses speech adaptation for improved accuracy
   */
  async transcribeWithContext(
    audioBuffer: Buffer,
    previousText: string,
    language?: string
  ): Promise<TranscriptionResult | TranscriptionError> {
    try {
      const languageCode =
        LANGUAGE_CODES[language || "en"] || language || "en-US";

      const startTime = Date.now();

      // Calculate duration for cost tracking
      const durationMs =
        (audioBuffer.length /
          (AUDIO_CONFIG.SAMPLE_RATE * AUDIO_CONFIG.CHANNELS * 2)) *
        1000;
      const durationMinutes = durationMs / 60000;

      // Use last 100 chars of previous text as context hint
      const contextPhrase = previousText.slice(-100).trim();

      const request: speech.protos.google.cloud.speech.v1.IRecognizeRequest = {
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: AUDIO_CONFIG.SAMPLE_RATE,
          languageCode,
          enableAutomaticPunctuation: true,
          maxAlternatives: 1,
          model: "latest_long",
          useEnhanced: true,
          // Speech adaptation for context
          adaptation: contextPhrase
            ? {
                phraseSets: [
                  {
                    phrases: [{ value: contextPhrase, boost: 5 }],
                  },
                ],
              }
            : undefined,
        },
        audio: {
          content: audioBuffer.toString("base64"),
        },
      };

      const [response] = await this.client.recognize(request);
      const processingTime = Date.now() - startTime;

      // Extract transcription from response
      const transcription = response.results
        ?.map((result) => result.alternatives?.[0]?.transcript || "")
        .join(" ")
        .trim();

      const confidence =
        response.results?.[0]?.alternatives?.[0]?.confidence || 0;

      // Calculate cost: $0.016 per minute
      const cost = durationMinutes * 0.016;
      this.totalCost += cost;
      this.totalDuration += durationMs;
      this.requestCount++;

      console.log(
        `[Google STT] Transcribed with context ${durationMinutes.toFixed(2)} minutes in ${processingTime}ms - Cost: $${cost.toFixed(4)}`
      );

      return {
        text: transcription || "",
        isFinal: true,
        confidence,
        language: languageCode,
        duration: durationMs,
        cost,
      };
    } catch (error) {
      console.error("[Google STT] Transcription error:", error);
      return this.handleError(error);
    }
  }

  /**
   * Transcribe with retry logic
   */
  async transcribeWithRetry(
    audioBuffer: Buffer,
    config: GoogleSTTConfig = {},
    maxRetries: number = 3
  ): Promise<TranscriptionResult | TranscriptionError> {
    let lastError: TranscriptionError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await this.transcribe(audioBuffer, config);

      // Success
      if ("text" in result) {
        return result;
      }

      // Non-retryable error
      if (!result.retryable) {
        return result;
      }

      lastError = result;

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000;
        console.log(
          `[Google STT] Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await this.delay(delayMs);
      }
    }

    return lastError!;
  }

  /**
   * Handle API errors
   */
  public handleError(error: unknown): TranscriptionError {
    const err = error as { code?: number | string; message?: string };

    // Quota exceeded
    if (err?.code === 8 || err?.code === "RESOURCE_EXHAUSTED") {
      return {
        error: "Quota exceeded",
        code: "QUOTA_EXCEEDED",
        retryable: true,
      };
    }

    // Invalid request
    if (err?.code === 3 || err?.code === "INVALID_ARGUMENT") {
      return {
        error: err?.message || "Invalid request",
        code: "INVALID_REQUEST",
        retryable: false,
      };
    }

    // Unavailable
    if (err?.code === 14 || err?.code === "UNAVAILABLE") {
      return {
        error: "Service unavailable",
        code: "UNAVAILABLE",
        retryable: true,
      };
    }

    // Authentication error
    if (err?.code === 16 || err?.code === "UNAUTHENTICATED") {
      return {
        error: "Authentication failed",
        code: "UNAUTHENTICATED",
        retryable: false,
      };
    }

    // Permission denied (API disabled or missing credentials)
    if (err?.code === 7 || err?.code === "PERMISSION_DENIED") {
      const isServiceDisabled = err?.message?.includes("disabled") || err?.message?.includes("not been used");
      return {
        error: isServiceDisabled 
          ? "Google Speech-to-Text API is disabled. Please enable it in Google Cloud Console." 
          : "Permission denied for Speech-to-Text API.",
        code: isServiceDisabled ? "SERVICE_DISABLED" : "PERMISSION_DENIED",
        retryable: false,
      };
    }

    // Deadline exceeded
    if (err?.code === 4 || err?.code === "DEADLINE_EXCEEDED") {
      return {
        error: "Request timeout",
        code: "TIMEOUT",
        retryable: true,
      };
    }

    // Unknown error
    return {
      error: err?.message || "Unknown transcription error",
      code: "UNKNOWN_ERROR",
      retryable: false,
    };
  }

  /**
   * Get cost statistics
   */
  getStats(): {
    totalCost: number;
    totalDuration: number;
    requestCount: number;
    averageCost: number;
  } {
    return {
      totalCost: this.totalCost,
      totalDuration: this.totalDuration,
      requestCount: this.requestCount,
      averageCost:
        this.requestCount > 0 ? this.totalCost / this.requestCount : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalCost = 0;
    this.totalDuration = 0;
    this.requestCount = 0;
  }

  /**
   * Update internal stats (called by streaming sessions)
   */
  updateStats(cost: number, duration: number): void {
    this.totalCost += cost;
    this.totalDuration += duration;
    this.requestCount++;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Configuration for streaming session behavior
 */
export interface StreamingSessionConfig {
  maxRestartAttempts?: number; // Maximum restart attempts (default: 3)
  restartDelayMs?: number; // Delay between restarts (default: 100ms)
  validateAudio?: boolean; // Validate audio before writing (default: true)
}

/**
 * Streaming Session for real-time transcription with VAD
 */
export class GoogleSTTStreamingSession extends EventEmitter {
  private client: speech.SpeechClient;
  private config: speech.protos.google.cloud.speech.v1.IStreamingRecognitionConfig;
  private service: GoogleSTTService;
  private recognizeStream: ReturnType<
    typeof speech.SpeechClient.prototype.streamingRecognize
  > | null = null;
  private isActive: boolean = false;
  private totalAudioDuration: number = 0;
  private startTime: number = 0;
  private speechStartTime: number | null = null;
  private hasSpeech: boolean = false;

  // Restart management
  private restartAttempts: number = 0;
  private maxRestartAttempts: number = 3;
  private restartDelayMs: number = 100;
  private validateAudioEnabled: boolean = true;

  // Accumulated cost for this session
  private sessionCost: number = 0;

  constructor(
    client: speech.SpeechClient,
    config: speech.protos.google.cloud.speech.v1.IStreamingRecognitionConfig,
    service: GoogleSTTService,
    sessionConfig?: StreamingSessionConfig
  ) {
    super();
    this.client = client;
    this.config = config;
    this.service = service;

    // Apply session configuration
    if (sessionConfig) {
      this.maxRestartAttempts =
        sessionConfig.maxRestartAttempts ?? this.maxRestartAttempts;
      this.restartDelayMs = sessionConfig.restartDelayMs ?? this.restartDelayMs;
      this.validateAudioEnabled =
        sessionConfig.validateAudio ?? this.validateAudioEnabled;
    }
  }

  /**
   * Start the streaming recognition session
   */
  start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.startTime = Date.now();
    this.totalAudioDuration = 0;
    this.speechStartTime = null;
    this.hasSpeech = false;
    this.restartAttempts = 0; // Reset restart attempts on fresh start
    this.sessionCost = 0;

    try {
      this.recognizeStream = this.client.streamingRecognize();

      // Send initial config
      console.log("[Google STT Stream] Sending streaming configuration");
      this.recognizeStream.write({
        streamingConfig: this.config,
      });

      // Handle responses
      this.recognizeStream.on(
        "data",
        (
          response: speech.protos.google.cloud.speech.v1.IStreamingRecognizeResponse
        ) => {
          this.handleResponse(response);
        }
      );

      this.recognizeStream.on("error", (error: Error) => {
        if (!this.isActive) return;
        console.error("[Google STT Stream] Error:", error);
        this.emit("error", error);
        this.cleanup();
      });

      this.recognizeStream.on("end", () => {
        if (!this.isActive) return;
        this.cleanup();
        this.emit("end");
      });

      this.emit("started");
      console.log("[Google STT Stream] Session started successfully");
    } catch (error) {
      console.error("[Google STT Stream] Failed to start:", error);
      this.isActive = false;
      this.emit("error", error);
    }

  }

  /**
   * Write audio data to the stream
   * @param audioBuffer - Raw PCM16 audio buffer
   * @returns true if write succeeded, false otherwise
   */
  write(audioBuffer: Buffer): boolean {
    if (!this.isActive || !this.recognizeStream) {
      return false;
    }

    // STRICT VALIDATION: Prevent empty/malformed buffers that cause MALORDERED_DATA errors
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      console.warn("[Google STT Stream] Skipping non-buffer or empty audio chunk");
      return false;
    }

    // Validate audio buffer if enabled
    if (this.validateAudioEnabled) {
      const validation = validateAudioBuffer(audioBuffer);
      if (!validation.isValid) {
        // Log but don't emit error for invalid audio - just skip it
        console.warn(
          `[Google STT Stream] Skipping invalid audio: ${validation.error}`
        );
        return false;
      }
    }

    try {
      // Calculate audio duration for cost tracking using AUDIO_CONFIG constants
      const bytesPerSample = AUDIO_CONFIG.BIT_DEPTH / 8;
      const durationMs =
        (audioBuffer.length /
          (AUDIO_CONFIG.SAMPLE_RATE * AUDIO_CONFIG.CHANNELS * bytesPerSample)) *
        1000;
      this.totalAudioDuration += durationMs;

      this.recognizeStream.write({
        audioContent: audioBuffer,
      });

      return true;
    } catch (error) {
      console.error("[Google STT Stream] Write error:", error);
      return false;
    }
  }

  /**
   * End the streaming session
   */
  end(): void {
    if (!this.isActive) return;

    try {
      if (this.recognizeStream) {
        this.recognizeStream.end();
      }
    } catch (error) {
      console.error("[Google STT Stream] End error:", error);
    }
  }

  /**
   * Handle streaming responses
   */
  private handleResponse(
    response: speech.protos.google.cloud.speech.v1.IStreamingRecognizeResponse
  ): void {
    // Handle speech events (Voice Activity Detection)
    if (response.speechEventType != null) {
      // Convert string/number to enum if needed
      const eventType =
        typeof response.speechEventType === "string"
          ? speech.protos.google.cloud.speech.v1.StreamingRecognizeResponse
              .SpeechEventType[
              response.speechEventType as keyof typeof speech.protos.google.cloud.speech.v1.StreamingRecognizeResponse.SpeechEventType
            ]
          : response.speechEventType;
      this.handleSpeechEvent(eventType);
    }

    // Handle transcription results
    if (response.results && response.results.length > 0) {
      for (const result of response.results) {
        if (!result.alternatives || result.alternatives.length === 0) continue;

        const alternative = result.alternatives[0];
        const isFinal = result.isFinal || false;

        // Calculate cost for final results
        let cost = 0;
        if (isFinal && result.resultEndTime) {
          const endTimeSeconds =
            Number(result.resultEndTime.seconds || 0) +
            Number(result.resultEndTime.nanos || 0) / 1e9;
          const startTimeSeconds = this.speechStartTime
            ? (this.speechStartTime - this.startTime) / 1000
            : 0;
          const durationMinutes = Math.max(
            0,
            (endTimeSeconds - startTimeSeconds) / 60
          );
          cost = durationMinutes * STT_COST_PER_MINUTE;
          this.sessionCost += cost; // Track session cost
          this.service.updateStats(cost, durationMinutes * 60000);
        }

        const transcription: TranscriptionResult = {
          text: alternative.transcript || "",
          isFinal,
          confidence: alternative.confidence || 0,
          duration: this.totalAudioDuration,
          cost,
          stability: result.stability ?? undefined,
        };

        this.emit("transcription", transcription);

        if (isFinal) {
          console.log(
            `[Google STT Stream] Final: "${transcription.text}" (confidence: ${transcription.confidence.toFixed(2)})`
          );
        }
      }
    }
  }

  /**
   * Handle speech activity events (built-in VAD)
   */
  private handleSpeechEvent(
    eventType: speech.protos.google.cloud.speech.v1.StreamingRecognizeResponse.SpeechEventType
  ): void {
    const now = Date.now();
    const SpeechEventType =
      speech.protos.google.cloud.speech.v1.StreamingRecognizeResponse
        .SpeechEventType;

    switch (eventType) {
      case SpeechEventType.SPEECH_EVENT_UNSPECIFIED:
        break;

      case SpeechEventType.END_OF_SINGLE_UTTERANCE:
        this.hasSpeech = false;
        this.emit("voiceActivity", {
          type: "END_OF_UTTERANCE",
          timestamp: now,
        } as VoiceActivityEvent);
        console.log("[Google STT Stream] End of utterance detected");
        break;

      case SpeechEventType.SPEECH_ACTIVITY_BEGIN:
        if (!this.hasSpeech) {
          this.hasSpeech = true;
          this.speechStartTime = now;
          this.emit("voiceActivity", {
            type: "SPEECH_START",
            timestamp: now,
          } as VoiceActivityEvent);
          console.log("[Google STT Stream] Speech started");
        }
        break;

      case SpeechEventType.SPEECH_ACTIVITY_END:
        if (this.hasSpeech) {
          this.hasSpeech = false;
          this.emit("voiceActivity", {
            type: "SPEECH_END",
            timestamp: now,
          } as VoiceActivityEvent);
          console.log("[Google STT Stream] Speech ended");
        }
        break;

      case SpeechEventType.SPEECH_ACTIVITY_TIMEOUT:
        this.hasSpeech = false;
        this.emit("voiceActivity", {
          type: "SPEECH_END",
          timestamp: now,
        } as VoiceActivityEvent);
        console.log("[Google STT Stream] Speech activity timeout");
        break;

      default:
        console.log("[Google STT Stream] Unknown speech event:", eventType);
    }
  }

  /**
   * Check if speech is currently being detected
   */
  isSpeaking(): boolean {
    return this.hasSpeech;
  }

  /**
   * Attempt to restart the session with retry limits
   * @returns Promise<boolean> - true if restart succeeded, false if max attempts reached
   */
  async attemptRestart(): Promise<boolean> {
    if (!this.isActive) {
      return false;
    }

    this.restartAttempts++;

    if (this.restartAttempts > this.maxRestartAttempts) {
      console.error(
        `[Google STT Stream] Max restart attempts (${this.maxRestartAttempts}) reached, giving up`
      );
      this.emit("maxRestartsReached", this.restartAttempts);
      return false;
    }

    console.log(
      `[Google STT Stream] Restart attempt ${this.restartAttempts}/${this.maxRestartAttempts}`
    );

    // Clean up current stream
    if (this.recognizeStream) {
      try {
        this.recognizeStream.end();
      } catch {
        // Ignore cleanup errors
      }
      this.recognizeStream = null;
    }

    // Wait before restarting
    await new Promise((resolve) => setTimeout(resolve, this.restartDelayMs));

    // Reset state but keep accumulated data
    this.isActive = false;

    // Attempt to start again
    try {
      this.start();
      return this.isActive;
    } catch (error) {
      console.error("[Google STT Stream] Restart failed:", error);
      return false;
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    isActive: boolean;
    totalDuration: number;
    hasSpeech: boolean;
    elapsedTime: number;
    sessionCost: number;
    restartAttempts: number;
  } {
    return {
      isActive: this.isActive,
      totalDuration: this.totalAudioDuration,
      hasSpeech: this.hasSpeech,
      elapsedTime: this.startTime > 0 ? Date.now() - this.startTime : 0,
      sessionCost: this.sessionCost,
      restartAttempts: this.restartAttempts,
    };
  }

  /**
   * Get the accumulated session cost
   */
  getSessionCost(): number {
    return this.sessionCost;
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (!this.isActive) return;
    this.isActive = false;
    
    if (this.recognizeStream) {
      this.recognizeStream.removeAllListeners();
      this.recognizeStream = null;
    }
  }


  /**
   * Destroy the session
   */
  destroy(): void {
    this.end();
    this.cleanup();
    this.removeAllListeners();
  }
}

/**
 * Singleton instance for reuse
 */
let sttInstance: GoogleSTTService | null = null;

/**
 * Get or create Google STT service instance
 */
export function getGoogleSTTService(): GoogleSTTService {
  if (!sttInstance) {
    sttInstance = new GoogleSTTService();
  }
  return sttInstance;
}

/**
 * Helper function for quick transcription
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  language?: string
): Promise<string | null> {
  const service = getGoogleSTTService();
  const result = await service.transcribe(audioBuffer, { language });

  if ("text" in result) {
    return result.text;
  }

  console.error("[Google STT] Transcription failed:", result.error);
  return null;
}

/**
 * Calculate estimated cost for audio duration
 */
export function estimateTranscriptionCost(durationMs: number): number {
  const durationMinutes = durationMs / 60000;
  return durationMinutes * 0.016; // $0.016 per minute
}
