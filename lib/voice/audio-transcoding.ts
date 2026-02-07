import ffmpeg from "fluent-ffmpeg";
import { PassThrough, Readable } from "stream";
import { AUDIO_CONFIG } from "./audio-processing";
import { env } from "@/lib/env";

// Set ffmpeg path if provided in env, otherwise rely on system PATH
if (env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(env.FFMPEG_PATH);
}

/**
 * Audio Transcoding Utility
 * Converts WebM/Opus audio from browser to LINEAR16 PCM for Google Cloud STT
 */

export interface TranscodingResult {
  pcmBuffer: Buffer;
  durationMs: number;
  sampleRate: number;
  channels: number;
}

export interface TranscodingError {
  error: string;
  code: string;
}

/**
 * Convert WebM/Opus audio to LINEAR16 PCM for Google Cloud STT
 * 
 * @param webmBuffer - Input WebM/Opus audio buffer from browser
 * @returns Promise<TranscodingResult | TranscodingError>
 */
export async function transcodeWebmToPCM(
  webmBuffer: Buffer
): Promise<TranscodingResult | TranscodingError> {
  return new Promise((resolve) => {
    try {
      // Validate input
      if (!Buffer.isBuffer(webmBuffer) || webmBuffer.length === 0) {
        resolve({
          error: "Invalid audio buffer",
          code: "INVALID_INPUT",
        });
        return;
      }

      const chunks: Buffer[] = [];
      const inputStream = Readable.from(webmBuffer);
      const outputStream = new PassThrough();

      // Collect output chunks
      outputStream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      outputStream.on("end", () => {
        const pcmBuffer = Buffer.concat(chunks);
        
        // Calculate duration
        const bytesPerSample = AUDIO_CONFIG.BIT_DEPTH / 8;
        const durationMs =
          (pcmBuffer.length /
            (AUDIO_CONFIG.SAMPLE_RATE *
              AUDIO_CONFIG.CHANNELS *
              bytesPerSample)) *
          1000;

        resolve({
          pcmBuffer,
          durationMs,
          sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
          channels: AUDIO_CONFIG.CHANNELS,
        });
      });

      // Configure ffmpeg for transcoding
      ffmpeg(inputStream)
        .inputFormat("webm")
        .audioChannels(AUDIO_CONFIG.CHANNELS) 
        .audioFrequency(AUDIO_CONFIG.SAMPLE_RATE) 
        .format("s16le")
        .on("error", (err: Error) => {
          console.error("[Audio Transcoding] Error:", err);
          resolve({
            error: `Transcoding failed: ${err.message}`,
            code: "TRANSCODING_ERROR",
          });
        })
        .pipe(outputStream, { end: true });
    } catch (error) {
      console.error("[Audio Transcoding] Unexpected error:", error);
      resolve({
        error: `Unexpected transcoding error: ${error instanceof Error ? error.message : String(error)}`,
        code: "UNEXPECTED_ERROR",
      });
    }
  });
}

/**
 * Transcode and validate audio chunk
 * Returns null if transcoding fails
 */
export async function transcodeAudioChunk(
  webmBuffer: Buffer
): Promise<Buffer | null> {
  const result = await transcodeWebmToPCM(webmBuffer);

  if ("error" in result) {
    console.error(
      `[Audio Transcoding] Failed to transcode audio: ${result.error}`
    );
    return null;
  }

  return result.pcmBuffer;
}

/**
 * Stream-based transcoder for real-time audio processing
 * Can be used for continuous audio streaming
 */
export class AudioTranscoder {
  private ffmpegCommand: ffmpeg.FfmpegCommand | null = null;
  private outputStream: PassThrough | null = null;
  private isActive: boolean = false;

  /**
   * Start the transcoding stream
   * Returns a readable stream that emits PCM chunks
   */
  start(): PassThrough {
    if (this.isActive) {
      throw new Error("Transcoder already active");
    }

    this.isActive = true;
    this.outputStream = new PassThrough();

    return this.outputStream;
  }

  /**
   * Write WebM/Opus chunk to transcoder
   * Output will be emitted via the stream returned by start()
   */
  async write(webmChunk: Buffer): Promise<boolean> {
    if (!this.isActive || !this.outputStream) {
      return false;
    }

    try {
      // For streaming, we need to transcode each chunk individually
      // due to WebM container format limitations
      const result = await transcodeWebmToPCM(webmChunk);

      if ("error" in result) {
        return false;
      }

      this.outputStream.write(result.pcmBuffer);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * End the transcoding stream
   */
  end(): void {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.outputStream) {
      this.outputStream.end();
      this.outputStream = null;
    }

    if (this.ffmpegCommand) {
      this.ffmpegCommand.kill("SIGKILL");
      this.ffmpegCommand = null;
    }
  }

  /**
   * Check if transcoder is active
   */
  get active(): boolean {
    return this.isActive;
  }
}

/**
 * Estimate transcoding time (usually very fast, <50ms for small chunks)
 */
export function estimateTranscodingTime(inputSizeBytes: number): number {
  return (inputSizeBytes / 1024) * 0.1;
}
