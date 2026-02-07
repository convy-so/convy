
import { createClient, LiveClient, LiveSchema, LiveTranscriptionEvents } from "@deepgram/sdk";
import { env } from "@/lib/env";
import { EventEmitter } from "events";
import { AUDIO_CONFIG, validateAudioBuffer } from "./audio-processing";

/**
 * Deepgram Speech-to-Text Service with Flux Model
 * Uses streaming recognition via WebSocket for real-time transcription
 * Cost: ~$0.0043 per minute for Nova/Flux generic models
 */

// Cost constant for reuse (approximate, check current pricing)
export const STT_COST_PER_MINUTE = 0.0043;

export interface DeepgramSTTConfig {
  language?: string; // BCP-47 code (e.g., 'en-US', 'fr-FR', 'de-DE')
  enableInterimResults?: boolean;
  enableAutoPunctuation?: boolean;
  model?: string; // Defaults to 'flux' for conversational AI
  encoding?: string;
  sampleRate?: number;
  // VAD Configuration (Built into Flux, but keeping interface for compatibility)
  speechStartTimeout?: number; 
  speechEndTimeout?: number; 
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

export interface VoiceActivityEvent {
  type: "SPEECH_START" | "SPEECH_END" | "END_OF_UTTERANCE";
  timestamp: number;
}

// Map Google language codes to Deepgram if needed, though they are mostly compatible BCP-47
const LANGUAGE_CODES: Record<string, string> = {
  en: "en", // Flux model uses 'en' for general English
  fr: "fr",
  de: "de",
};

/**
 * Validate Deepgram configuration
 */
export function validateDeepgramCredentials(): void {
  if (!env.DEEPGRAM_API_KEY) {
    throw new Error(
      `Deepgram credentials not configured. Voice features require DEEPGRAM_API_KEY environment variable.`
    );
  }
  console.log(`[Deepgram STT] Credentials configured`);
}

/**
 * Deepgram STT Service
 */
export class DeepgramSTTService {
  private client: ReturnType<typeof createClient>;
  private isInitialized: boolean = false;

  constructor() {
    validateDeepgramCredentials();
    this.client = createClient(env.DEEPGRAM_API_KEY!);
    this.isInitialized = true;
    console.log("[Deepgram STT] Service initialized successfully");
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Create a streaming recognition session
   */
  createStreamingSession(config: DeepgramSTTConfig = {}): DeepgramSTTStreamingSession {
    const language = LANGUAGE_CODES[config.language || "en"] || config.language || "en";
    
    // Default to 'flux-general-${lang}' model which is optimized for voice agents
    // Flux is language-specific and requires the /v2/listen endpoint (handled by SDK)
    // Allow override via config for testing or specific use cases
    const baseLang = (language || "en").split("-")[0];
    const model = config.model || `flux-general-${baseLang}`; 

    const liveOptions: LiveSchema = {
       model,
       language,
       smart_format: true,
       interim_results: config.enableInterimResults ?? true,
       encoding: "linear16",
       sample_rate: AUDIO_CONFIG.SAMPLE_RATE,
       channels: 1,
       // Flux specific settings for turn detection
       // config.speechEndTimeout is in seconds, convert to milliseconds
       // Default 1000ms provides good balance between responsiveness and avoiding premature cutoff
       endpointing: config.speechEndTimeout ? Math.round(config.speechEndTimeout * 1000) : 1000, 
       vad_events: true,
    };

    return new DeepgramSTTStreamingSession(this.client, liveOptions);
  }

  /**
   * Handle API errors (mapping Deepgram errors to standard format)
   */
   public handleError(error: unknown): { error: string, code: string, retryable: boolean } {
    const err = error as any;
    const msg = err?.message || String(error);

    if (msg.includes("401")) {
        return { error: "Authentication failed", code: "UNAUTHENTICATED", retryable: false };
    }
    if (msg.includes("402") || msg.includes("Insufficient funds")) {
        return { error: "Quota exceeded / Insufficient funds", code: "QUOTA_EXCEEDED", retryable: false };
    }
    if (msg.includes("429") || msg.includes("limit")) {
        return { error: "Rate limit exceeded", code: "RATE_LIMIT", retryable: true };
    }
    if (msg.includes("connection")) {
        return { error: "Connection error", code: "CONNECTION_ERROR", retryable: true };
    }

    return { error: msg, code: "UNKNOWN_ERROR", retryable: false };
  }
}

/**
 * Singleton instance
 */
let sttInstance: DeepgramSTTService | null = null;

export function getDeepgramSTTService(): DeepgramSTTService {
    if (!sttInstance) {
        sttInstance = new DeepgramSTTService();
    }
    return sttInstance;
}

/**
 * Streaming Session for real-time transcription
 */
export class DeepgramSTTStreamingSession extends EventEmitter {
  private connection: LiveClient | null = null;
  private client: ReturnType<typeof createClient>;
  private options: LiveSchema;
  private isActive: boolean = false;
  
  // Stats
  private startTime: number = 0;
  private totalAudioBytes: number = 0;
  
  constructor(client: ReturnType<typeof createClient>, options: LiveSchema) {
    super();
    this.client = client;
    this.options = options;
  }

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.startTime = Date.now();
    this.totalAudioBytes = 0;

    try {
        console.log("[Deepgram Stream] Initializing connection with options:", this.options);
        this.connection = this.client.listen.live(this.options);

        this.connection.on(LiveTranscriptionEvents.Open, () => {
             console.log("[Deepgram Stream] Connection opened");
             this.emit("started");
        });

        this.connection.on(LiveTranscriptionEvents.Close, () => {
             console.log("[Deepgram Stream] Connection closed");
             this.emit("end");
        });
        
        this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
             this.handleTranscript(data);
        });
        
        this.connection.on(LiveTranscriptionEvents.Metadata, (data) => {
             // console.log("[Deepgram Stream] Metadata:", data);
        });

        this.connection.on(LiveTranscriptionEvents.Error, (err) => {
             console.error("[Deepgram Stream] Error:", err);
             this.emit("error", err);
        });
        
        // Handle SpeechStarted event (part of VAD)
        this.connection.on(LiveTranscriptionEvents.SpeechStarted, (data) => {
            this.emit("voiceActivity", {
                type: "SPEECH_START",
                timestamp: Date.now()
            });
        });
        
        // UtteranceEnd is the "Flux" way of saying a complete thought/sentence is finished
        this.connection.on(LiveTranscriptionEvents.UtteranceEnd, (data) => {
             this.emit("voiceActivity", {
                type: "END_OF_UTTERANCE", // More accurate than SPEECH_END
                timestamp: Date.now()
             });
        });

    } catch (error) {
        console.error("[Deepgram Stream] Failed to start:", error);
        this.emit("error", error);
        this.isActive = false;
    }
  }

  async write(audioBuffer: Buffer): Promise<boolean> {
    if (!this.isActive || !this.connection) return false;

    // Validate buffer format matches Deepgram expectations
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) return false;
    
    // Check for proper 16-bit alignment
    if (audioBuffer.length % 2 !== 0) {
      console.error("[Deepgram Stream] Invalid audio buffer: not 16-bit aligned");
      return false;
    }

    try {
        // Convert Buffer to ArrayBuffer for Deepgram SDK compatibility
        const arrayBuffer = audioBuffer.buffer.slice(
            audioBuffer.byteOffset,
            audioBuffer.byteOffset + audioBuffer.byteLength
        );
        this.connection.send(arrayBuffer);
        this.totalAudioBytes += audioBuffer.length;
        return true;
    } catch (error) {
        console.error("[Deepgram Stream] Write error:", error);
        return false;
    }
  }

  end(): void {
    if (!this.isActive) return;
    this.isActive = false;
    
    if (this.connection) {
        try {
            this.connection.finish(); // Cleanly close
            this.connection = null;
        } catch (error) {
            console.error("[Deepgram Stream] End error:", error);
        }
    }
  }

  // Handle automatic restart logic if needed (Flux connection is usually robust)
  async attemptRestart(): Promise<void> {
      this.end();
      // Small delay
      await new Promise(r => setTimeout(r, 500));
      this.start();
  }

  destroy(): void {
      this.end();
      this.removeAllListeners();
  }

  private handleTranscript(data: any): void {
      const alternative = data.channel?.alternatives?.[0];
      const isFinal = data.is_final;
      
      if (!alternative) return;

      const text = alternative.transcript;
      if (!text && !isFinal) return; // Ignore empty interim

      // Use actual duration from Deepgram response
      const durationSec = data.duration || 0;
      const durationMs = durationSec * 1000;
      const durationMin = durationMs / 60000;
      const cost = durationMin * STT_COST_PER_MINUTE;

      const result: TranscriptionResult = {
          text,
          isFinal,
          confidence: alternative.confidence || 0, // Bug #11: Handle undefined confidence
          language: this.options.language,
          duration: durationMs,
          cost: isFinal ? cost : 0, // Only charge for final results
          stability: alternative.stability || 0.9
      };

      this.emit("transcription", result);
  }
}
