export interface StreamFieldExtractorOptions {
  maxSeekBufferSize?: number;
  fillerPhrase?: string;
  onSafetyGateTripped?: (reason: string) => void;
}

/**
 * Filter state machine for extracting the "response" field from a JSON LLM stream.
 */
export class StreamFieldExtractor {
  private state: "SEEKING" | "STREAMING" | "TRIPPED" = "SEEKING";
  private searchBuffer = "";
  private trailingBuffer = "";
  private options: StreamFieldExtractorOptions;

  constructor(options: StreamFieldExtractorOptions = {}) {
    this.options = {
      maxSeekBufferSize: 5000,
      fillerPhrase: "Just a moment...",
      onSafetyGateTripped: (r) => console.warn(`[StreamFieldExtractor] Safety gate tripped: ${r}`),
      ...options,
    };
  }

  /**
   * Process a single incoming string chunk from the LLM.
   * Returns the clean filtered text chunk (or empty string if filtering/seeking).
   */
  processChunk(chunk: string): string {
    if (this.state === "TRIPPED") {
      return "";
    }

    if (this.state === "SEEKING") {
      this.searchBuffer += chunk;
      
      const match = this.searchBuffer.match(/"response"\s*:\s*"/);
      if (match && match.index !== undefined) {
        console.log("[StreamFieldExtractor] Found response field. Transitioning to STREAMING.");
        this.state = "STREAMING";
        const contentStartIndex = match.index + match[0].length;
        const initialContent = this.searchBuffer.slice(contentStartIndex);
        
        let unescaped = this.unescapeJsonChunk(initialContent);
        this.trailingBuffer += unescaped;
        this.searchBuffer = ""; 
        return this.flushTrailingBuffer(false);
      } else if (this.searchBuffer.length > this.options.maxSeekBufferSize!) {
        console.warn("[StreamFieldExtractor] Seek buffer full. Buffer sample:", this.searchBuffer.slice(0, 500));
        this.state = "TRIPPED";
        this.options.onSafetyGateTripped!("Seek buffer size exceeded");
        return this.options.fillerPhrase!;
      }
      return ""; // Still seeking
    }

    if (this.state === "STREAMING" && chunk) {
      let unescapedChunk = this.unescapeJsonChunk(chunk);
      this.trailingBuffer += unescapedChunk;
      return this.flushTrailingBuffer(false);
    }

    return "";
  }

  /**
   * Called when the LLM stream ends. Flushes remaining buffers and strips trailing JSON syntax.
   */
  flush(): string {
    if (this.state === "SEEKING") {
      this.options.onSafetyGateTripped!("Stream ended before 'response' field was found.");
      return this.options.fillerPhrase!;
    } else if (this.state === "STREAMING") {
      return this.flushTrailingBuffer(true);
    }
    return "";
  }

  private flushTrailingBuffer(isFinal: boolean): string {
    if (isFinal) {
      let remaining = this.trailingBuffer.replace(/["}\s]+$/, "");
      this.trailingBuffer = "";
      return remaining;
    } else {
      if (this.trailingBuffer.length > 5) {
        const toYield = this.trailingBuffer.slice(0, -5);
        this.trailingBuffer = this.trailingBuffer.slice(-5);
        return toYield;
      }
      return "";
    }
  }

  private unescapeJsonChunk(text: string): string {
    return text.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
}
