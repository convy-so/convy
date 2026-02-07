/**
 * PCM Audio Worklet Processor
 * Captures raw audio and converts to 16-bit PCM at 16kHz for Deepgram STT
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048; // ~128ms at 16kHz
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    // Handle stop command from main thread
    this.port.onmessage = (event) => {
      if (event.data.command === 'stop') {
        this.stopped = true;
      }
    };
    this.stopped = false;
  }

  /**
   * Downsample audio from native rate to target rate
   * Simple linear interpolation
   */
  downsample(inputBuffer, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
      return inputBuffer;
    }
    
    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.floor(inputBuffer.length / ratio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputBuffer.length - 1);
      const t = srcIndex - srcIndexFloor;
      
      // Linear interpolation
      output[i] = inputBuffer[srcIndexFloor] * (1 - t) + inputBuffer[srcIndexCeil] * t;
    }
    
    return output;
  }

  /**
   * Convert Float32 samples to 16-bit signed integers
   */
  floatTo16BitPCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp value between -1 and 1
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit signed integer
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    return int16Array;
  }

  /**
   * Process audio input
   * Called for each 128-sample audio block
   */
  process(inputs, outputs, parameters) {
    if (this.stopped) {
      return false;
    }

    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    // Take first channel (mono)
    const inputChannel = input[0];
    if (!inputChannel || inputChannel.length === 0) {
      return true;
    }

    // Add samples to buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];
      
      // When buffer is full, send it
      if (this.bufferIndex >= this.bufferSize) {
        this.sendBuffer();
      }
    }

    return true;
  }

  sendBuffer() {
    // Downsample from native rate (usually 44100 or 48000) to 16000 Hz
    // sampleRate is a global in AudioWorkletGlobalScope
    const downsampled = this.downsample(this.buffer, sampleRate, 16000);
    
    // Convert to 16-bit PCM
    const pcm16 = this.floatTo16BitPCM(downsampled);
    
    // Send to main thread as ArrayBuffer
    this.port.postMessage({
      type: 'audio',
      buffer: pcm16.buffer
    }, [pcm16.buffer]);
    
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
