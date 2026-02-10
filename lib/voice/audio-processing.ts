
import { Readable, Transform, PassThrough } from "stream";
import * as prism from "prism-media";
import { WaveFile } from "wavefile";
import ffmpeg from "fluent-ffmpeg";

/**
 * Audio configuration optimized for Deepgram Speech-to-Text
 * Based on Deepgram's recommendations for LINEAR16 encoding
 */
export const AUDIO_CONFIG = {
  // UPDATED: Now using native browser sample rate (48kHz) for better quality
  // Deepgram handles internal resampling with professional-grade algorithms
  SAMPLE_RATE: 48000, // 48kHz - Native browser rate, Deepgram resamples internally
  CHANNELS: 1, // Mono - speech recognition doesn't benefit from stereo
  BIT_DEPTH: 16, // 16-bit PCM - standard for voice processing

  // Frame/buffer sizing
  FRAME_SIZE: 960, // ~20ms at 48kHz for low latency

  // Buffering configuration for AudioBufferManager
  MAX_CHUNK_DURATION_MS: 5000, // 5 seconds max buffer
  MIN_CHUNK_DURATION_MS: 800, // 800ms minimum for coherent chunks
  OVERLAP_DURATION_MS: 200, // 200ms overlap to prevent word boundary cuts

  // NOTE: The following are kept for reference but not actively used
  // as Deepgram handles resampling and normalization internally
  TARGET_LOUDNESS: -16, // LUFS (Loudness Units Full Scale)
  LOUDNESS_RANGE: 7, // LU (dynamic range target)
  TRUE_PEAK: -1.5, // dBTP (true peak limit)
  RESAMPLE_QUALITY: "high" as const,
  RESAMPLE_FILTER_SIZE: 32,
  RESAMPLE_PHASE_SHIFT: 10,
  RESAMPLE_CUTOFF: 0.97,
} as const;

/**
 * Validation thresholds for audio quality checks
 */
export const VALIDATION_LIMITS = {
  MIN_BUFFER_SIZE: AUDIO_CONFIG.FRAME_SIZE * 2, // Minimum viable audio frame
  MAX_BUFFER_SIZE: 100 * 1024 * 1024, // 100MB - prevent DoS attacks
  MAX_SAMPLE_RATE: 48000, // Maximum supported sample rate
  MIN_SAMPLE_RATE: 8000, // Minimum for intelligible speech
  MAX_DURATION_MS: 300000, // 5 minutes - prevent excessive memory usage
} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AudioMetadata {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  durationMs: number;
  sizeBytes: number;
}

export interface NormalizationResult {
  buffer: Buffer;
  metadata: AudioMetadata;
  appliedGain: number;
  measuredLoudness: number;
}

export interface ResamplingResult {
  buffer: Buffer;
  metadata: AudioMetadata;
  originalSampleRate: number;
  targetSampleRate: number;
}

export interface AudioValidationError {
  isValid: false;
  error: string;
  code:
    | "EMPTY_BUFFER"
    | "INVALID_SIZE"
    | "INVALID_ALIGNMENT"
    | "TOO_SMALL"
    | "TOO_LARGE"
    | "INVALID_SAMPLE_RATE";
}

export interface AudioValidationSuccess {
  isValid: true;
  metadata: AudioMetadata;
}

export type AudioValidationResult =
  | AudioValidationError
  | AudioValidationSuccess;

// ============================================================================
// AUDIO BUFFER MANAGEMENT WITH OVERLAPPING WINDOWS
// ============================================================================

/**
 * Production-ready audio buffer manager with overlapping window strategy
 *
 * OVERLAPPING WINDOWS EXPLANATION:
 * When chunking continuous audio, cutting at arbitrary points can split words in half,
 * degrading transcription accuracy. The overlapping window approach:
 *
 * 1. Keeps last N milliseconds of previous chunk (overlap)
 * 2. Prepends overlap to next chunk
 * 3. Post-processing deduplicates the overlapping transcription
 *
 * Example: "Hello world" -> "Hello wo" + "wo rld"
 * With overlap: "Hello wo" + [overlap: "o wo"] + "wo rld"
 * Result: Continuous "Hello world" without word breaks
 *
 * MEMORY SAFETY: Implements limits to prevent unbounded growth
 */
export class AudioBufferManager {
  private chunks: Buffer[] = [];
  private overlapBuffer: Buffer | null = null;
  private totalDuration: number = 0;
  private lastActivityTime: number = Date.now();
  private readonly overlapSamples: number;

  constructor(
    private maxDurationMs: number = AUDIO_CONFIG.MAX_CHUNK_DURATION_MS,
    private overlapMs: number = AUDIO_CONFIG.OVERLAP_DURATION_MS
  ) {
    // Calculate samples needed for overlap duration
    this.overlapSamples = Math.floor(
      (overlapMs / 1000) * AUDIO_CONFIG.SAMPLE_RATE * AUDIO_CONFIG.CHANNELS
    );
  }

  /**
   * Add audio chunk to buffer with overlap handling
   *
   * @param chunk - Raw PCM16 audio chunk
   * @param hasSpeech - VAD result from Google STT (not locally computed)
   */
  addChunk(chunk: Buffer, hasSpeech: boolean): void {
    // Only buffer chunks with speech (Google STT's VAD determines this)
    if (!hasSpeech) {
      return;
    }

    this.chunks.push(chunk);
    this.lastActivityTime = Date.now();

    // Calculate chunk duration for tracking
    const chunkDurationMs = estimateDuration(chunk.length);
    this.totalDuration += chunkDurationMs;

    // Store overlap from this chunk for next window
    this.updateOverlapBuffer(chunk);
  }

  /**
   * Update the overlap buffer with tail of current chunk
   * This ensures smooth transitions between chunks
   */
  private updateOverlapBuffer(chunk: Buffer): void {
    const bytesPerSample = 2; // 16-bit = 2 bytes
    const overlapBytes = this.overlapSamples * bytesPerSample;

    // Only keep overlap if chunk is large enough
    if (chunk.length >= overlapBytes) {
      this.overlapBuffer = chunk.subarray(chunk.length - overlapBytes);
    }
  }

  /**
   * Check if buffer should be flushed based on duration or silence
   *
   * @param silenceThresholdMs - Duration of silence before flushing (default: 1s)
   * @returns true if buffer should be processed
   */
  shouldFlush(silenceThresholdMs: number = 1000): boolean {
    const timeSinceActivity = Date.now() - this.lastActivityTime;

    return (
      // Duration limit reached
      this.totalDuration >= this.maxDurationMs ||
      // Has minimum content AND detected silence period
      (this.totalDuration >= AUDIO_CONFIG.MIN_CHUNK_DURATION_MS &&
        timeSinceActivity >= silenceThresholdMs)
    );
  }

  /**
   * Flush buffer with overlap prepended and reset state
   *
   * @returns Combined audio buffer with overlap, or null if empty
   */
  flush(): Buffer | null {
    if (this.chunks.length === 0) {
      return null;
    }

    // Combine all chunks
    const combined = Buffer.concat(this.chunks);

    // Prepend overlap from previous chunk for smooth transition
    const result = this.overlapBuffer
      ? Buffer.concat([this.overlapBuffer, combined])
      : combined;

    // Reset state but keep overlap for next window
    this.chunks = [];
    this.totalDuration = 0;
    this.lastActivityTime = Date.now();
    // Note: overlapBuffer is retained for next chunk

    return result;
  }

  /**
   * Get current buffer duration in milliseconds
   */
  getDuration(): number {
    return this.totalDuration;
  }

  /**
   * Clear all buffered data including overlap
   */
  clear(): void {
    this.chunks = [];
    this.overlapBuffer = null;
    this.totalDuration = 0;
    this.lastActivityTime = Date.now();
  }

  /**
   * Check if buffer has any content
   */
  hasContent(): boolean {
    return this.chunks.length > 0;
  }

  /**
   * Get information about current buffer state (for monitoring/debugging)
   */
  getBufferInfo(): {
    chunkCount: number;
    durationMs: number;
    hasOverlap: boolean;
    timeSinceActivity: number;
  } {
    return {
      chunkCount: this.chunks.length,
      durationMs: this.totalDuration,
      hasOverlap: this.overlapBuffer !== null,
      timeSinceActivity: Date.now() - this.lastActivityTime,
    };
  }
}



// ============================================================================
// AUDIO VALIDATION WITH DETAILED ERROR REPORTING
// ============================================================================

/**
 * Comprehensive audio buffer validation for production environments
 *
 * VALIDATION CHECKLIST:
 * - Non-empty buffer
 * - Proper size alignment (16-bit = 2 bytes)
 * - Minimum viable content
 * - DOS protection (size limits)
 * - Sample rate validation
 *
 * @param buffer - Audio buffer to validate
 * @param sampleRate - Sample rate for additional validation
 * @returns Detailed validation result with error codes
 */
export function validateAudioBuffer(
  buffer: Buffer,
  sampleRate?: number
): AudioValidationResult {
  // Check 1: Empty buffer
  if (!buffer || buffer.length === 0) {
    return {
      isValid: false,
      error: "Audio buffer is empty",
      code: "EMPTY_BUFFER",
    };
  }

  // Check 2: Size limits (DoS protection)
  if (buffer.length > VALIDATION_LIMITS.MAX_BUFFER_SIZE) {
    return {
      isValid: false,
      error: `Audio buffer too large: ${buffer.length} bytes (max: ${VALIDATION_LIMITS.MAX_BUFFER_SIZE})`,
      code: "TOO_LARGE",
    };
  }

  // Check 3: 16-bit alignment
  if (buffer.length % 2 !== 0) {
    return {
      isValid: false,
      error: `Audio buffer size (${buffer.length}) is not 16-bit aligned (must be even)`,
      code: "INVALID_ALIGNMENT",
    };
  }

  // Check 4: Minimum content
  if (buffer.length < VALIDATION_LIMITS.MIN_BUFFER_SIZE) {
    return {
      isValid: false,
      error: `Audio buffer too small: ${buffer.length} bytes (min: ${VALIDATION_LIMITS.MIN_BUFFER_SIZE})`,
      code: "TOO_SMALL",
    };
  }

  // Check 5: Sample rate validation (if provided)
  if (sampleRate !== undefined) {
    if (
      sampleRate < VALIDATION_LIMITS.MIN_SAMPLE_RATE ||
      sampleRate > VALIDATION_LIMITS.MAX_SAMPLE_RATE
    ) {
      return {
        isValid: false,
        error: `Invalid sample rate: ${sampleRate}Hz (must be ${VALIDATION_LIMITS.MIN_SAMPLE_RATE}-${VALIDATION_LIMITS.MAX_SAMPLE_RATE}Hz)`,
        code: "INVALID_SAMPLE_RATE",
      };
    }
  }

  // All checks passed - return success with metadata
  const durationMs = estimateDuration(buffer.length);

  return {
    isValid: true,
    metadata: {
      sampleRate: sampleRate || AUDIO_CONFIG.SAMPLE_RATE,
      channels: AUDIO_CONFIG.CHANNELS,
      bitDepth: AUDIO_CONFIG.BIT_DEPTH,
      durationMs,
      sizeBytes: buffer.length,
    },
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Estimate audio duration from buffer size
 *
 * Formula: duration = bytes / (sample_rate * channels * bytes_per_sample)
 *
 * @param bufferSize - Buffer size in bytes
 * @param sampleRate - Sample rate (default: 16kHz)
 * @param channels - Number of channels (default: 1)
 * @returns Duration in milliseconds
 */
export function estimateDuration(
  bufferSize: number,
  sampleRate: number = AUDIO_CONFIG.SAMPLE_RATE,
  channels: number = AUDIO_CONFIG.CHANNELS
): number {
  const bytesPerSample = 2; // 16-bit = 2 bytes
  return (bufferSize / (sampleRate * channels * bytesPerSample)) * 1000;
}

/**
 * Calculate buffer size needed for a specific duration
 *
 * @param durationMs - Desired duration in milliseconds
 * @param sampleRate - Sample rate (default: 16kHz)
 * @param channels - Number of channels (default: 1)
 * @returns Required buffer size in bytes
 */
export function calculateBufferSize(
  durationMs: number,
  sampleRate: number = AUDIO_CONFIG.SAMPLE_RATE,
  channels: number = AUDIO_CONFIG.CHANNELS
): number {
  const bytesPerSample = 2; // 16-bit = 2 bytes
  return Math.floor(
    (durationMs / 1000) * sampleRate * channels * bytesPerSample
  );
}

/**
 * Create silent audio buffer (useful for padding or testing)
 *
 * @param durationMs - Duration of silence in milliseconds
 * @param sampleRate - Sample rate (default: 16kHz)
 * @param channels - Number of channels (default: 1)
 * @returns Buffer filled with zeros (silence)
 */
export function createSilentBuffer(
  durationMs: number,
  sampleRate: number = AUDIO_CONFIG.SAMPLE_RATE,
  channels: number = AUDIO_CONFIG.CHANNELS
): Buffer {
  const size = calculateBufferSize(durationMs, sampleRate, channels);
  return Buffer.alloc(size); // Zeros = silence in PCM
}
