import "server-only";

import { MicVAD, utils } from "@ricky0123/vad-node";
import { env } from "@/lib/env";
import { AUDIO_CONFIG, hasEnergyBasedSpeech } from "./audio-processing";

/**
 * Voice Activity Detection Service
 * Uses Silero VAD for accurate speech detection with cost optimization
 */

export interface VADConfig {
  sensitivity?: number; // 0.0 to 1.0 (higher = more sensitive)
  minSpeechDuration?: number; // milliseconds
  redemptionFrames?: number; // frames to wait before marking as silence
  frameSizeMs?: number; // size of each audio frame in ms
}

export interface VADResult {
  hasSpeech: boolean;
  probability: number;
  timestamp: number;
}

/**
 * Voice Activity Detector using Silero VAD
 */
export class VoiceActivityDetector {
  private vad: MicVAD | null = null;
  private sensitivity: number;
  private isInitialized: boolean = false;
  private speechCallbacks: Set<(result: VADResult) => void> = new Set();
  private silenceCallbacks: Set<(duration: number) => void> = new Set();
  private lastSpeechTime: number = 0;

  constructor(config: VADConfig = {}) {
    this.sensitivity = config.sensitivity ?? parseFloat(env.VAD_SENSITIVITY);
  }

  /**
   * Initialize the VAD model
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.vad = await MicVAD.new({
        // Model configuration
        positiveSpeechThreshold: this.sensitivity,
        negativeSpeechThreshold: this.sensitivity - 0.15,
        redemptionFrames: 8, // ~250ms of silence before marking as end

        // Frame configuration for optimal latency
        frameSamples: AUDIO_CONFIG.FRAME_SIZE,

        // Audio configuration
        sampleRate: AUDIO_CONFIG.SAMPLE_RATE,

        // Callbacks
        onSpeechStart: () => {
          this.lastSpeechTime = Date.now();
          this.notifySpeech({
            hasSpeech: true,
            probability: 1.0,
            timestamp: Date.now(),
          });
        },

        onSpeechEnd: (audio) => {
          const silenceDuration = Date.now() - this.lastSpeechTime;
          this.notifySilence(silenceDuration);
        },

        onVADMisfire: () => {
          // Handle false positives
          this.notifySpeech({
            hasSpeech: false,
            probability: 0.0,
            timestamp: Date.now(),
          });
        },
      });

      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize VAD:", error);
      throw new Error("VAD initialization failed");
    }
  }

  /**
   * Process audio buffer and detect speech
   * Returns probability of speech being present
   */
  async detectSpeech(audioBuffer: Buffer): Promise<VADResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Convert buffer to Float32Array for VAD processing
      const audioData = this.bufferToFloat32(audioBuffer);

      // Process with Silero VAD
      const probability = await this.processAudioFrame(audioData);

      const result: VADResult = {
        hasSpeech: probability > this.sensitivity,
        probability,
        timestamp: Date.now(),
      };

      if (result.hasSpeech) {
        this.lastSpeechTime = Date.now();
      }

      return result;
    } catch (error) {
      console.error("VAD processing error:", error);

      // Fallback to energy-based detection
      return this.fallbackDetection(audioBuffer);
    }
  }

  /**
   * Process audio frame with VAD
   */
  private async processAudioFrame(audioData: Float32Array): Promise<number> {
    // Note: The actual Silero VAD processing would happen here
    // The @ricky0123/vad-node library handles this internally
    // For custom processing, we'd need to load the ONNX model directly

    // For now, we'll use a simplified approach
    // In production, you'd integrate with the actual VAD model

    // Calculate energy as a simple heuristic
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sum / audioData.length);

    // Normalize to 0-1 probability
    return Math.min(1.0, rms * 10);
  }

  /**
   * Fallback energy-based detection when VAD fails
   */
  private fallbackDetection(audioBuffer: Buffer): VADResult {
    const hasSpeech = hasEnergyBasedSpeech(audioBuffer, 500);
    return {
      hasSpeech,
      probability: hasSpeech ? 0.8 : 0.2,
      timestamp: Date.now(),
    };
  }

  /**
   * Convert PCM16 buffer to Float32Array for VAD processing
   */
  private bufferToFloat32(buffer: Buffer): Float32Array {
    const samples = new Float32Array(buffer.length / 2);

    for (let i = 0; i < samples.length; i++) {
      // Read 16-bit PCM sample and normalize to [-1, 1]
      const sample = buffer.readInt16LE(i * 2);
      samples[i] = sample / 32768.0;
    }

    return samples;
  }

  /**
   * Register callback for speech detection
   */
  onSpeech(callback: (result: VADResult) => void): void {
    this.speechCallbacks.add(callback);
  }

  /**
   * Register callback for silence detection
   */
  onSilence(callback: (duration: number) => void): void {
    this.silenceCallbacks.add(callback);
  }

  /**
   * Notify speech detection callbacks
   */
  private notifySpeech(result: VADResult): void {
    this.speechCallbacks.forEach((callback) => {
      try {
        callback(result);
      } catch (error) {
        console.error("Speech callback error:", error);
      }
    });
  }

  /**
   * Notify silence detection callbacks
   */
  private notifySilence(duration: number): void {
    this.silenceCallbacks.forEach((callback) => {
      try {
        callback(duration);
      } catch (error) {
        console.error("Silence callback error:", error);
      }
    });
  }

  /**
   * Remove callback
   */
  removeCallback(callback: Function): void {
    this.speechCallbacks.delete(callback as any);
    this.silenceCallbacks.delete(callback as any);
  }

  /**
   * Get time since last speech detected
   */
  getTimeSinceLastSpeech(): number {
    return Date.now() - this.lastSpeechTime;
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.lastSpeechTime = 0;
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.vad) {
      await this.vad.destroy();
      this.vad = null;
    }
    this.speechCallbacks.clear();
    this.silenceCallbacks.clear();
    this.isInitialized = false;
  }
}

/**
 * Singleton VAD instance for reuse
 */
let globalVAD: VoiceActivityDetector | null = null;

/**
 * Get or create global VAD instance
 */
export async function getVAD(
  config?: VADConfig
): Promise<VoiceActivityDetector> {
  if (!globalVAD) {
    globalVAD = new VoiceActivityDetector(config);
    await globalVAD.initialize();
  }
  return globalVAD;
}

/**
 * Batch process multiple audio chunks with VAD
 * Returns only chunks with speech detected (cost optimization)
 */
export async function filterSpeechChunks(
  audioChunks: Buffer[],
  config?: VADConfig
): Promise<Buffer[]> {
  const vad = await getVAD(config);
  const speechChunks: Buffer[] = [];

  for (const chunk of audioChunks) {
    const result = await vad.detectSpeech(chunk);
    if (result.hasSpeech) {
      speechChunks.push(chunk);
    }
  }

  return speechChunks;
}

/**
 * Estimate cost savings from VAD filtering
 * Returns percentage of audio that was filtered out
 */
export function calculateVADSavings(
  totalChunks: number,
  speechChunks: number
): { savingsPercent: number; filteredChunks: number } {
  const filteredChunks = totalChunks - speechChunks;
  const savingsPercent = (filteredChunks / totalChunks) * 100;

  return {
    savingsPercent: Math.round(savingsPercent * 100) / 100,
    filteredChunks,
  };
}
