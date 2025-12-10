import "server-only";

import { Readable, Transform } from "stream";
import * as prism from "prism-media";
import { WaveFile } from "wavefile";

/**
 * Audio Processing Utilities for Voice Features
 * Handles audio format conversion, buffering, and optimization
 */

// Audio configuration constants
export const AUDIO_CONFIG = {
  SAMPLE_RATE: 16000, // 16kHz for Whisper
  CHANNELS: 1, // Mono
  BIT_DEPTH: 16, // 16-bit PCM
  FRAME_SIZE: 512, // samples per frame (32ms at 16kHz)
  BUFFER_SIZE: 16384, // bytes
  MAX_CHUNK_DURATION_MS: 2000, // 2 seconds per chunk for Whisper
  MIN_CHUNK_DURATION_MS: 500, // 500ms minimum
  OPUS_BITRATE: 16000, // 16kbps for speech
} as const;

/**
 * Convert audio buffer to WAV format required by Whisper API
 */
export function bufferToWav(audioBuffer: Buffer): Buffer {
  const wav = new WaveFile();

  // Create WAV from raw PCM data
  wav.fromScratch(
    AUDIO_CONFIG.CHANNELS,
    AUDIO_CONFIG.SAMPLE_RATE,
    AUDIO_CONFIG.BIT_DEPTH.toString(),
    audioBuffer
  );

  return Buffer.from(wav.toBuffer());
}

/**
 * Convert Opus audio to PCM16 format
 */
export class OpusDecoder extends Transform {
  private decoder: prism.opus.Decoder;

  constructor() {
    super();
    this.decoder = new prism.opus.Decoder({
      rate: AUDIO_CONFIG.SAMPLE_RATE,
      channels: AUDIO_CONFIG.CHANNELS,
      frameSize: AUDIO_CONFIG.FRAME_SIZE,
    });

    // Pipe decoder output to this transform's output
    this.decoder.on("data", (chunk: Buffer) => {
      this.push(chunk);
    });

    this.decoder.on("error", (error: Error) => {
      this.emit("error", error);
    });

    this.decoder.on("end", () => {
      this.push(null);
    });
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    try {
      // Write chunk to decoder - it will emit 'data' events that we handle above
      if (!this.decoder.write(chunk)) {
        // If write returns false, the decoder is backpressured
        // Wait for 'drain' event before continuing
        this.decoder.once("drain", callback);
      } else {
        callback();
      }
    } catch (error) {
      callback(error as Error);
    }
  }

  _flush(callback: (error?: Error | null) => void): void {
    this.decoder.end();
    callback();
  }
}

/**
 * Audio buffer manager with silence trimming support
 */
export class AudioBufferManager {
  private chunks: Buffer[] = [];
  private totalDuration: number = 0;
  private lastActivityTime: number = Date.now();

  constructor(
    private maxDurationMs: number = AUDIO_CONFIG.MAX_CHUNK_DURATION_MS
  ) {}

  /**
   * Add audio chunk to buffer
   */
  addChunk(chunk: Buffer, hasSpeech: boolean): void {
    if (hasSpeech) {
      this.chunks.push(chunk);
      this.lastActivityTime = Date.now();

      // Calculate duration (bytes / (sample_rate * channels * bytes_per_sample))
      const chunkDurationMs =
        (chunk.length /
          (AUDIO_CONFIG.SAMPLE_RATE * AUDIO_CONFIG.CHANNELS * 2)) *
        1000;
      this.totalDuration += chunkDurationMs;
    }
  }

  /**
   * Check if buffer should be flushed
   */
  shouldFlush(silenceThresholdMs: number = 1000): boolean {
    const timeSinceActivity = Date.now() - this.lastActivityTime;
    return (
      this.totalDuration >= this.maxDurationMs ||
      (this.totalDuration >= AUDIO_CONFIG.MIN_CHUNK_DURATION_MS &&
        timeSinceActivity >= silenceThresholdMs)
    );
  }

  /**
   * Get combined audio buffer and reset
   */
  flush(): Buffer | null {
    if (this.chunks.length === 0) {
      return null;
    }

    const combined = Buffer.concat(this.chunks);
    this.chunks = [];
    this.totalDuration = 0;
    this.lastActivityTime = Date.now();

    return combined;
  }

  /**
   * Get current buffer duration in milliseconds
   */
  getDuration(): number {
    return this.totalDuration;
  }

  /**
   * Clear all buffered chunks
   */
  clear(): void {
    this.chunks = [];
    this.totalDuration = 0;
    this.lastActivityTime = Date.now();
  }

  /**
   * Check if buffer has content
   */
  hasContent(): boolean {
    return this.chunks.length > 0;
  }
}

/**
 * Calculate RMS (Root Mean Square) energy of audio buffer
 * Used for simple energy-based VAD as fallback
 */
export function calculateRMS(buffer: Buffer): number {
  if (buffer.length === 0) return 0;

  let sum = 0;
  // Process as 16-bit PCM samples
  for (let i = 0; i < buffer.length - 1; i += 2) {
    const sample = buffer.readInt16LE(i);
    sum += sample * sample;
  }

  const sampleCount = buffer.length / 2;
  return Math.sqrt(sum / sampleCount);
}

/**
 * Simple energy-based speech detection
 * Returns true if buffer contains speech based on energy threshold
 */
export function hasEnergyBasedSpeech(
  buffer: Buffer,
  threshold: number = 500
): boolean {
  const rms = calculateRMS(buffer);
  return rms > threshold;
}

/**
 * Convert WebM/Opus audio chunk to PCM16
 */
export async function convertWebMToPCM(webmBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const decoder = new prism.opus.Decoder({
      rate: AUDIO_CONFIG.SAMPLE_RATE,
      channels: AUDIO_CONFIG.CHANNELS,
      frameSize: AUDIO_CONFIG.FRAME_SIZE,
    });

    const readable = Readable.from(webmBuffer);

    readable
      .pipe(decoder)
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .on("error", reject);
  });
}

/**
 * Resample audio to target sample rate
 * Note: This is a simple implementation. For production, consider using ffmpeg
 */
export function resampleAudio(
  buffer: Buffer,
  fromRate: number,
  toRate: number
): Buffer {
  if (fromRate === toRate) return buffer;

  const ratio = toRate / fromRate;
  const sampleCount = Math.floor((buffer.length / 2) * ratio);
  const resampled = Buffer.alloc(sampleCount * 2);

  for (let i = 0; i < sampleCount; i++) {
    const sourceIndex = Math.floor(i / ratio) * 2;
    if (sourceIndex < buffer.length - 1) {
      const sample = buffer.readInt16LE(sourceIndex);
      resampled.writeInt16LE(sample, i * 2);
    }
  }

  return resampled;
}

/**
 * Normalize audio levels
 */
export function normalizeAudio(
  buffer: Buffer,
  targetRMS: number = 1000
): Buffer {
  const currentRMS = calculateRMS(buffer);
  if (currentRMS === 0) return buffer;

  const gain = targetRMS / currentRMS;
  const normalized = Buffer.alloc(buffer.length);

  for (let i = 0; i < buffer.length - 1; i += 2) {
    const sample = buffer.readInt16LE(i);
    const amplified = Math.max(-32768, Math.min(32767, sample * gain));
    normalized.writeInt16LE(amplified, i);
  }

  return normalized;
}

/**
 * Estimate audio duration from buffer size
 */
export function estimateDuration(bufferSize: number): number {
  // bytes / (sample_rate * channels * bytes_per_sample) * 1000 for ms
  return (
    (bufferSize / (AUDIO_CONFIG.SAMPLE_RATE * AUDIO_CONFIG.CHANNELS * 2)) * 1000
  );
}

/**
 * Validate audio buffer
 */
export function isValidAudioBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) return false;
  if (buffer.length % 2 !== 0) return false; // Must be 16-bit aligned
  if (buffer.length < AUDIO_CONFIG.FRAME_SIZE * 2) return false; // Min frame size
  return true;
}
