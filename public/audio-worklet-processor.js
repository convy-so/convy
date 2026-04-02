/**
 * PCM Audio Worklet Processor with 80ms Buffering
 *
 * DEEPGRAM FLUX OPTIMIZATIONS:
 * 1. Receives 16kHz audio directly (Native Browser Resampling)
 * 2. Buffers audio to send in ~80ms chunks (2560 bytes at 16kHz)
 *
 * Why 16kHz?
 * - Deepgram Flux is optimized for 16kHz audio
 * - Reduces bandwidth significantly
 * - Browser handles high-quality resampling from hardware rate (44.1/48kHz)
 *
 * Why 80ms chunks?
 * - Deepgram Flux requires ~80ms chunks for optimal turn detection
 * - At 16kHz: 16000 samples/sec * 0.08 sec = 1280 samples = 2560 bytes
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Target 80ms at 16kHz = 1280 samples
    this.targetSamples16k = 1280;
    this.buffer16k = new Int16Array(this.targetSamples16k);
    this.bufferIndex = 0;

    this.port.onmessage = (event) => {
      if (event.data.command === "stop") {
        this.stopped = true;
      }
    };
    this.stopped = false;
    this.processCount = 0;
    this.hasStarted = false;
  }

  /**
   * Convert Float32 sample to 16-bit PCM
   */
  floatTo16Bit(sample) {
    const s = Math.max(-1, Math.min(1, sample));
    return s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  /**
   * Process audio input with buffering (Input is already 16kHz from AudioContext)
   * Called for each 128-sample audio block
   */
  process(inputs) {
    if (this.stopped) return false;

    if (!this.hasStarted) {
      this.hasStarted = true;
    }

    this.processCount++;

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const inputChannel = input[0];
    if (!inputChannel || inputChannel.length === 0) return true;

    // Process each sample
    for (let i = 0; i < inputChannel.length; i++) {
      // Input is already 16kHz, so we process every sample
      // Convert to 16-bit PCM and store
      const pcmSample = this.floatTo16Bit(inputChannel[i]);
      this.buffer16k[this.bufferIndex] = pcmSample;
      this.bufferIndex++;

      // Send buffer when we reach 80ms worth of data
      if (this.bufferIndex >= this.targetSamples16k) {
        this.sendBuffer();
      }
    }

    return true;
  }

  sendBuffer() {
    // Create a copy of the buffer to send
    const dataToSend = new Int16Array(this.buffer16k);

    // Post data back to main thread
    this.port.postMessage(
      {
        type: "audio",
        buffer: dataToSend.buffer,
        sampleRate: 16000,
      },
      [dataToSend.buffer],
    );

    // Reset buffer index
    this.bufferIndex = 0;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
