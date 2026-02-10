/**
 * PCM Audio Worklet Processor
 * Captures raw audio and converts to 16-bit PCM at native sample rate for Deepgram STT
 * 
 * PRODUCTION OPTIMIZATION: Sends audio at native rate (typically 48kHz) instead of 
 * downsampling to 16kHz in the browser. This avoids quality degradation from poor 
 * client-side resampling. Deepgram handles professional-grade resampling internally.
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 1024;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    this.port.onmessage = (event) => {
      if (event.data.command === 'stop') {
        this.stopped = true;
      }
    };
    this.stopped = false;
  }

  /**
   * Convert Float32 samples to 16-bit signed integers
   */
  floatTo16BitPCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
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

    const inputChannel = input[0];
    if (!inputChannel || inputChannel.length === 0) {
      return true;
    }

    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];
      
      if (this.bufferIndex >= this.bufferSize) {
        this.sendBuffer();
      }
    }

    return true;
  }

  sendBuffer() {
    const pcm16 = this.floatTo16BitPCM(this.buffer);
  
    this.port.postMessage({
      type: 'audio',
      buffer: pcm16.buffer,
      sampleRate: sampleRate 
    }, [pcm16.buffer]);
    
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
