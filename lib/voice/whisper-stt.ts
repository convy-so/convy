import "server-only";

import OpenAI from "openai";
import { env } from "@/lib/env";
import {
  bufferToWav,
  estimateDuration,
  isValidAudioBuffer,
} from "./audio-processing";
import { Readable } from "stream";

/**
 * OpenAI Whisper Speech-to-Text Service
 * Cost: $0.006 per minute (very cost-effective)
 */

export interface TranscriptionOptions {
  language?: string; // ISO-639-1 code (e.g., 'en', 'fr', 'de')
  prompt?: string; // Context to improve accuracy
  temperature?: number; // 0-1 (lower = more conservative)
  model?: "whisper-1";
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration: number;
  cost: number; // Estimated cost in USD
}

export interface TranscriptionError {
  error: string;
  code: string;
  retryable: boolean;
}

/**
 * Whisper STT Service Class
 */
export class WhisperSTTService {
  private client: OpenAI;
  private totalCost: number = 0;
  private requestCount: number = 0;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  /**
   * Transcribe audio buffer to text
   */
  async transcribe(
    audioBuffer: Buffer,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult | TranscriptionError> {
    try {
      // Validate audio buffer
      if (!isValidAudioBuffer(audioBuffer)) {
        return {
          error: "Invalid audio buffer",
          code: "INVALID_AUDIO",
          retryable: false,
        };
      }

      // Convert to WAV format required by Whisper
      const wavBuffer = bufferToWav(audioBuffer);

      // Estimate duration for cost calculation
      const durationMs = estimateDuration(audioBuffer.length);
      const durationMinutes = durationMs / 60000;

      // Create a file-like object from buffer
      const audioFile = this.bufferToFile(wavBuffer, "audio.wav");

      // Call Whisper API
      const startTime = Date.now();
      const transcription = await this.client.audio.transcriptions.create({
        file: audioFile,
        model: options.model || "whisper-1",
        language: options.language,
        prompt: options.prompt,
        temperature: options.temperature || 0.2,
        response_format: "json",
      });

      const processingTime = Date.now() - startTime;

      // Calculate cost: $0.006 per minute
      const cost = durationMinutes * 0.006;
      this.totalCost += cost;
      this.requestCount++;

      console.log(
        `[Whisper STT] Transcribed ${durationMinutes.toFixed(2)} minutes in ${processingTime}ms - Cost: $${cost.toFixed(4)}`
      );

      return {
        text: transcription.text,
        language: transcription.language,
        duration: durationMs,
        cost,
      };
    } catch (error: any) {
      console.error("[Whisper STT] Transcription error:", error);

      return this.handleError(error);
    }
  }

  /**
   * Transcribe with automatic language detection
   */
  async transcribeAuto(
    audioBuffer: Buffer,
    prompt?: string
  ): Promise<TranscriptionResult | TranscriptionError> {
    return this.transcribe(audioBuffer, {
      prompt,
      temperature: 0.0, // Most conservative for auto-detection
    });
  }

  /**
   * Transcribe with context from previous conversation
   * Improves accuracy by providing context
   */
  async transcribeWithContext(
    audioBuffer: Buffer,
    previousText: string,
    language?: string
  ): Promise<TranscriptionResult | TranscriptionError> {
    // Use last 200 chars of previous text as context
    const contextPrompt = previousText.slice(-200);

    return this.transcribe(audioBuffer, {
      language,
      prompt: contextPrompt,
      temperature: 0.2,
    });
  }

  /**
   * Batch transcribe multiple audio chunks
   * Returns results in order
   */
  async transcribeBatch(
    audioBuffers: Buffer[],
    options: TranscriptionOptions = {}
  ): Promise<Array<TranscriptionResult | TranscriptionError>> {
    const results: Array<TranscriptionResult | TranscriptionError> = [];

    for (const buffer of audioBuffers) {
      const result = await this.transcribe(buffer, options);
      results.push(result);

      // Small delay to avoid rate limiting
      if (audioBuffers.length > 1) {
        await this.delay(100);
      }
    }

    return results;
  }

  /**
   * Stream transcription for real-time processing
   * Processes audio chunks as they arrive
   */
  async *transcribeStream(
    audioBuffers: AsyncIterable<Buffer>,
    options: TranscriptionOptions = {}
  ): AsyncGenerator<TranscriptionResult | TranscriptionError> {
    for await (const buffer of audioBuffers) {
      yield await this.transcribe(buffer, options);
    }
  }

  /**
   * Convert buffer to File-like object for OpenAI API
   */
  private bufferToFile(buffer: Buffer, filename: string): File {
    const blob = new Blob([buffer], { type: "audio/wav" });
    return new File([blob], filename, { type: "audio/wav" });
  }

  /**
   * Handle API errors and determine if retryable
   */
  private handleError(error: any): TranscriptionError {
    // Rate limit error
    if (error?.status === 429) {
      return {
        error: "Rate limit exceeded",
        code: "RATE_LIMIT",
        retryable: true,
      };
    }

    // Invalid request
    if (error?.status === 400) {
      return {
        error: error?.message || "Invalid request",
        code: "INVALID_REQUEST",
        retryable: false,
      };
    }

    // Server error
    if (error?.status >= 500) {
      return {
        error: "OpenAI service error",
        code: "SERVER_ERROR",
        retryable: true,
      };
    }

    // Network error
    if (error?.code === "ECONNREFUSED" || error?.code === "ETIMEDOUT") {
      return {
        error: "Network error",
        code: "NETWORK_ERROR",
        retryable: true,
      };
    }

    // Unknown error
    return {
      error: error?.message || "Unknown transcription error",
      code: "UNKNOWN_ERROR",
      retryable: false,
    };
  }

  /**
   * Retry transcription with exponential backoff
   */
  async transcribeWithRetry(
    audioBuffer: Buffer,
    options: TranscriptionOptions = {},
    maxRetries: number = 3
  ): Promise<TranscriptionResult | TranscriptionError> {
    let lastError: TranscriptionError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await this.transcribe(audioBuffer, options);

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
          `[Whisper STT] Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await this.delay(delayMs);
      }
    }

    return lastError!;
  }

  /**
   * Get total cost statistics
   */
  getStats(): {
    totalCost: number;
    requestCount: number;
    averageCost: number;
  } {
    return {
      totalCost: this.totalCost,
      requestCount: this.requestCount,
      averageCost:
        this.requestCount > 0 ? this.totalCost / this.requestCount : 0,
    };
  }

  /**
   * Reset cost tracking
   */
  resetStats(): void {
    this.totalCost = 0;
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
 * Singleton instance for reuse
 */
let whisperInstance: WhisperSTTService | null = null;

/**
 * Get or create Whisper STT service instance
 */
export function getWhisperService(): WhisperSTTService {
  if (!whisperInstance) {
    whisperInstance = new WhisperSTTService();
  }
  return whisperInstance;
}

/**
 * Helper function for quick transcription
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  language?: string
): Promise<string | null> {
  const service = getWhisperService();
  const result = await service.transcribe(audioBuffer, { language });

  if ("text" in result) {
    return result.text;
  }

  console.error("[Whisper STT] Transcription failed:", result.error);
  return null;
}

/**
 * Calculate estimated cost for audio duration
 */
export function estimateTranscriptionCost(durationMs: number): number {
  const durationMinutes = durationMs / 60000;
  return durationMinutes * 0.006; // $0.006 per minute
}
