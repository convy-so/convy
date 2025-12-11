import "server-only";

import * as googleTTS from "@google-cloud/text-to-speech";
import { env } from "@/lib/env";

/**
 * Google Cloud Text-to-Speech Service
 * Cost: $4 per 1M characters for Standard voices (cost-effective)
 */

export interface TTSOptions {
  language?: string; // BCP-47 code (e.g., 'en-US', 'fr-FR', 'de-DE')
  voice?: string; // Voice name (e.g., 'en-US-Standard-A')
  gender?: "MALE" | "FEMALE" | "NEUTRAL";
  speakingRate?: number; // 0.25 to 4.0 (1.0 is normal)
  pitch?: number; // -20.0 to 20.0 (0.0 is default)
  volumeGainDb?: number; // -96.0 to 16.0
}

export interface TTSResult {
  audio: Buffer;
  cost: number; // Estimated cost in USD
  characterCount: number;
  duration: number; // Estimated duration in ms
}

export interface TTSError {
  error: string;
  code: string;
  retryable: boolean;
}

/**
 * Voice configurations for different languages and tones
 */
export const VOICE_PROFILES = {
  // English voices
  "en-casual": {
    language: "en-US",
    name: "en-US-Standard-D",
    gender: "MALE" as const,
    pitch: 0,
    speakingRate: 1.0,
  },
  "en-formal": {
    language: "en-US",
    name: "en-US-Standard-A",
    gender: "FEMALE" as const,
    pitch: 0,
    speakingRate: 0.95,
  },
  "en-playful": {
    language: "en-US",
    name: "en-US-Standard-H",
    gender: "FEMALE" as const,
    pitch: 2,
    speakingRate: 1.1,
  },
  "en-empathetic": {
    language: "en-US",
    name: "en-US-Standard-C",
    gender: "FEMALE" as const,
    pitch: -1,
    speakingRate: 0.95,
  },

  // French voices
  "fr-casual": {
    language: "fr-FR",
    name: "fr-FR-Standard-C",
    gender: "FEMALE" as const,
    pitch: 0,
    speakingRate: 1.0,
  },
  "fr-formal": {
    language: "fr-FR",
    name: "fr-FR-Standard-B",
    gender: "MALE" as const,
    pitch: 0,
    speakingRate: 0.95,
  },

  // German voices
  "de-casual": {
    language: "de-DE",
    name: "de-DE-Standard-A",
    gender: "FEMALE" as const,
    pitch: 0,
    speakingRate: 1.0,
  },
  "de-formal": {
    language: "de-DE",
    name: "de-DE-Standard-B",
    gender: "MALE" as const,
    pitch: 0,
    speakingRate: 0.95,
  },
} as const;

/**
 * Google TTS Service Class
 */
export class GoogleTTSService {
  private client: googleTTS.TextToSpeechClient;
  private totalCost: number = 0;
  private totalCharacters: number = 0;
  private requestCount: number = 0;

  constructor() {
    // Initialize with credentials from environment
    const config: { keyFilename?: string; projectId?: string } = {};

    if (env.GOOGLE_APPLICATION_CREDENTIALS) {
      config.keyFilename = env.GOOGLE_APPLICATION_CREDENTIALS;
    }

    if (env.GOOGLE_CLOUD_PROJECT_ID) {
      config.projectId = env.GOOGLE_CLOUD_PROJECT_ID;
    }

    this.client = new googleTTS.TextToSpeechClient(config);
  }

  /**
   * Synthesize text to speech
   */
  async synthesize(
    text: string,
    options: TTSOptions = {}
  ): Promise<TTSResult | TTSError> {
    try {
      if (!text || text.trim().length === 0) {
        return {
          error: "Empty text provided",
          code: "EMPTY_TEXT",
          retryable: false,
        };
      }

      const characterCount = text.length;

      // Build request
      const request: googleTTS.protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest =
        {
          input: { text },
          voice: {
            languageCode: options.language || "en-US",
            name: options.voice,
            ssmlGender: options.gender || "NEUTRAL",
          },
          audioConfig: {
            audioEncoding: "LINEAR16", // PCM16 for consistency
            sampleRateHertz: 16000, // Match Whisper sample rate
            speakingRate: options.speakingRate || 1.0,
            pitch: options.pitch || 0.0,
            volumeGainDb: options.volumeGainDb || 0.0,
          },
        };

      const startTime = Date.now();
      const [response] = await this.client.synthesizeSpeech(request);
      const processingTime = Date.now() - startTime;

      if (!response.audioContent) {
        return {
          error: "No audio content in response",
          code: "NO_AUDIO",
          retryable: true,
        };
      }

      // Calculate cost: $4 per 1M characters for Standard voices
      const cost = (characterCount / 1000000) * 4;
      this.totalCost += cost;
      this.totalCharacters += characterCount;
      this.requestCount++;

      // Estimate duration (rough approximation: ~10 chars per second at 1.0 speaking rate)
      const estimatedDuration =
        ((characterCount / 10) * 1000) / (options.speakingRate || 1.0);

      console.log(
        `[Google TTS] Synthesized ${characterCount} chars in ${processingTime}ms - Cost: $${cost.toFixed(6)}`
      );

      return {
        audio: Buffer.from(response.audioContent as Uint8Array),
        cost,
        characterCount,
        duration: estimatedDuration,
      };
    } catch (error: unknown) {
      console.error("[Google TTS] Synthesis error:", error);
      return this.handleError(error);
    }
  }

  /**
   * Synthesize with voice profile
   */
  async synthesizeWithProfile(
    text: string,
    profileKey: keyof typeof VOICE_PROFILES
  ): Promise<TTSResult | TTSError> {
    const profile = VOICE_PROFILES[profileKey];

    return this.synthesize(text, {
      language: profile.language,
      voice: profile.name,
      gender: profile.gender,
      pitch: profile.pitch,
      speakingRate: profile.speakingRate,
    });
  }

  /**
   * Synthesize with survey tone
   */
  async synthesizeForSurvey(
    text: string,
    tone: "formal" | "casual" | "playful" | "empathetic",
    language: "en" | "fr" | "de" = "en"
  ): Promise<TTSResult | TTSError> {
    const profileKey = `${language}-${tone}` as keyof typeof VOICE_PROFILES;

    // Fallback to casual if profile doesn't exist
    if (!VOICE_PROFILES[profileKey]) {
      return this.synthesizeWithProfile(
        text,
        `${language}-casual` as keyof typeof VOICE_PROFILES
      );
    }

    return this.synthesizeWithProfile(text, profileKey);
  }

  /**
   * Stream synthesis for long text
   * Breaks text into chunks and synthesizes progressively
   */
  async *synthesizeStream(
    text: string,
    options: TTSOptions = {},
    chunkSize: number = 500
  ): AsyncGenerator<TTSResult | TTSError> {
    // Split text into sentences/chunks
    const chunks = this.splitTextIntoChunks(text, chunkSize);

    for (const chunk of chunks) {
      yield await this.synthesize(chunk, options);
    }
  }

  /**
   * Batch synthesize multiple texts
   */
  async synthesizeBatch(
    texts: string[],
    options: TTSOptions = {}
  ): Promise<Array<TTSResult | TTSError>> {
    const results: Array<TTSResult | TTSError> = [];

    for (const text of texts) {
      const result = await this.synthesize(text, options);
      results.push(result);

      // Small delay to avoid rate limiting
      if (texts.length > 1) {
        await this.delay(50);
      }
    }

    return results;
  }

  /**
   * Synthesize with retry logic
   */
  async synthesizeWithRetry(
    text: string,
    options: TTSOptions = {},
    maxRetries: number = 3
  ): Promise<TTSResult | TTSError> {
    let lastError: TTSError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await this.synthesize(text, options);

      // Success
      if ("audio" in result) {
        return result;
      }

      // Non-retryable error
      if (!result.retryable) {
        return result;
      }

      lastError = result;

      // Exponential backoff
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000;
        console.log(
          `[Google TTS] Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await this.delay(delayMs);
      }
    }

    return lastError!;
  }

  /**
   * Split text into speakable chunks
   */
  private splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = "";

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length <= maxChunkSize) {
        currentChunk += sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
    }

    if (currentChunk) chunks.push(currentChunk.trim());

    return chunks;
  }

  /**
   * Handle API errors
   */
  private handleError(error: unknown): TTSError {
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

    // Unknown error
    return {
      error: err?.message || "Unknown synthesis error",
      code: "UNKNOWN_ERROR",
      retryable: false,
    };
  }

  /**
   * Get cost statistics
   */
  getStats(): {
    totalCost: number;
    totalCharacters: number;
    requestCount: number;
    averageCost: number;
  } {
    return {
      totalCost: this.totalCost,
      totalCharacters: this.totalCharacters,
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
    this.totalCharacters = 0;
    this.requestCount = 0;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance
 */
let ttsInstance: GoogleTTSService | null = null;

/**
 * Get or create TTS service instance
 */
export function getTTSService(): GoogleTTSService {
  if (!ttsInstance) {
    ttsInstance = new GoogleTTSService();
  }
  return ttsInstance;
}

/**
 * Helper function for quick synthesis
 */
export async function textToSpeech(
  text: string,
  language?: string
): Promise<Buffer | null> {
  const service = getTTSService();
  const result = await service.synthesize(text, { language });

  if ("audio" in result) {
    return result.audio;
  }

  console.error("[Google TTS] Synthesis failed:", result.error);
  return null;
}

/**
 * Calculate estimated cost for text
 */
export function estimateTTSCost(characterCount: number): number {
  return (characterCount / 1000000) * 4; // $4 per 1M characters
}
