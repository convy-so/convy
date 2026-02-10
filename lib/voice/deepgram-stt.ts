
import { createClient, LiveClient, LiveSchema, LiveTranscriptionEvents, DeepgramClientOptions } from "@deepgram/sdk";
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
  language?: string; // BCP-47 code like "en-US", "fr-FR", etc.
  model?: string; // Override model (e.g., for testing or specific use-case)
  enableInterimResults?: boolean;
  enableAutoPunctuation?: boolean;  
  speechEndTimeout?: number; // seconds
  sampleRate?: number; // Audio sample rate (8000-48000 Hz), defaults to 48000
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
  en: "en", // Flux model - English only
  fr: "fr", // Nova-3 - French
  de: "de", // Nova-3 - German
  es: "es", // Nova-3 - Spanish
  it: "it", // Nova-3 - Italian
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
  private client: ReturnType<typeof createClient> | null = null;
  private isInitialized: boolean = false;

  constructor() {
    validateDeepgramCredentials();
    // Client is initialized on first use to ensure options are ready
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
    const baseLang = (language || "en").split("-")[0];
    
    const SUPPORTED_LANGUAGES = ['en', 'de', 'fr', 'es', 'it'];
    if (!SUPPORTED_LANGUAGES.includes(baseLang)) {
      console.warn(`[Deepgram STT] Language ${baseLang} not in supported list, defaulting to English`);
    }
    
    let model: string;
    if (baseLang === "en") {
      model = config.model || `flux-general-en`;
      console.log(`[Deepgram STT] Using Flux model for English (conversational AI optimized)`);
    } else {
      // Nova-3 supports multilingual with industry-leading accuracy
      model = config.model || `nova-3-general`;
      console.log(`[Deepgram STT] Using Nova-3 model for ${baseLang} (multilingual support)`);
    }

    const liveOptions: LiveSchema = {
       model,
       language,
       smart_format: true,
       interim_results: config.enableInterimResults ?? true,
       encoding: "linear16",
       sample_rate: config.sampleRate || 48000,
       channels: 1,
       
       // VAD and Endpointing Configuration:
       // VAD and Endpointing Configuration:
       // Flux (English): Uses smart internal turn detection + fallback endpointing
       // Nova-3 (Multilingual): Uses utterance_end_ms for robustness in noisy environments (ignores background noise)
       endpointing: baseLang === "en" 
         ? (config.speechEndTimeout ? Math.round(config.speechEndTimeout * 1000) : 1000)
         : false, // Disable audio-based VAD for Nova-3 so noise doesn't keep stream open
       
       utterance_end_ms: baseLang === "en"
         ? undefined
         : (config.speechEndTimeout ? Math.round(config.speechEndTimeout * 1000) : 1000), 
       
       vad_events: true, 
    };

    console.log(`[Deepgram STT] Creating session with options: ${JSON.stringify(liveOptions)}`);
    
    // Configure Deepgram with 'ws' package implementation
    // This avoids global scope pollution and is the recommended way to use Deepgram in Node
    // We need to cast to any because the SDK types don't fully expose the transport options in the public interface
    let deepgramOptions: any = {};
    
    try {
        const WebSocket = require("ws");
        deepgramOptions = {
            global: {
                websocket: {
                    options: {
                       // @ts-ignore - The SDK types don't publicize this but it's supported
                       client: WebSocket
                    }
                }
            }
        };
        console.log("[Deepgram STT] Configured Deepgram client with 'ws' package implementation");
    } catch (e) {
        console.error("[Deepgram STT] Failed to load 'ws' package:", e);
    }

    // Initialize singleton client if not already created
    if (!this.client) {
         if (!env.DEEPGRAM_API_KEY) {
             console.error(`[Deepgram STT] CRITICAL: API Key missing in env during initialization`);
             throw new Error("Deepgram API Key missing");
         }
         this.client = createClient(env.DEEPGRAM_API_KEY, deepgramOptions);
         console.log(`[Deepgram STT] Initialized singleton Deepgram client. Key prefix: ${env.DEEPGRAM_API_KEY.substring(0, 4)}...`);
    }

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
  public isActive: boolean = false;
  
  private isReady: boolean = false; 
  private keepAliveInterval: NodeJS.Timeout | null = null;
  
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
    this.isReady = false; 
    this.startTime = Date.now();
    this.totalAudioBytes = 0;

    try {
        console.log("[Deepgram Stream] Initializing connection with options:", this.options);
        this.connection = this.client.listen.live(this.options);

        this.connection.on(LiveTranscriptionEvents.Open, () => {
             console.log("[Deepgram Stream] Connection opened");
             this.isReady = true; 
             this.startKeepAlive(); 
             this.emit("started");
        });

        this.connection.on(LiveTranscriptionEvents.Close, () => {
             console.log("[Deepgram Stream] Connection closed");
             this.cleanup(); // [FIX] Ensure cleanup runs
             this.emit("end");
        });
        
        this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
             this.handleTranscript(data);
        });
        
        this.connection.on(LiveTranscriptionEvents.Metadata, (data) => {
             // console.log("[Deepgram Stream] Metadata:", data);
        });

        this.connection.on(LiveTranscriptionEvents.Error, (err) => {
             console.error("[Deepgram Stream] Error event received:", err);
             // ... error logging ...
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
        this.isReady = false;
    }
  }

  // [FIX] KeepAlive Implementation
  private startKeepAlive() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    
    // Send KeepAlive every 5 seconds (recommended 3-10s)
    this.keepAliveInterval = setInterval(() => {
        if (this.connection && this.connection.getReadyState() === 1) { // 1 = OPEN
            this.connection.keepAlive();
        }
    }, 5000);
  }

  // [FIX] Cleanup helper
  private cleanup() {
      this.isReady = false;
      if (this.keepAliveInterval) {
          clearInterval(this.keepAliveInterval);
          this.keepAliveInterval = null;
      }
  }

  async write(audioBuffer: Buffer): Promise<boolean> {
    if (!this.isActive || !this.connection) return false;

    // [FIX] Race condition check
    if (!this.isReady) {
        // Drop chunk if not ready to avoid race conditions or buffering issues
        // In a real-time system, dropping early packets is often better than lag
        return false;
    }

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
    this.cleanup(); // [FIX]
    
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
          confidence: alternative.confidence || 0, 
          language: this.options.language,
          duration: durationMs,
          cost: isFinal ? cost : 0, // Only charge for final results
          stability: alternative.stability || 0.9
      };

      this.emit("transcription", result);
  }
}
