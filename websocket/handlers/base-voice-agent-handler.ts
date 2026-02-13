import { surveys } from "@/db/schema";
import { WebSocket } from "ws";
import {
  checkMessageAllowed,
  checkAudioChunkAllowed,
} from "../middleware/rate-limit";
import {
  createVoiceError,
  sendVoiceError,
} from "@/lib/voice/errors";
import {
  DeepgramVoiceAgentConnection,
  type VoiceAgentSettings,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
} from "@/lib/voice/deepgram-voice-agent";

// Configuration constants
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_WARNING_MS = 30 * 1000;

/**
 * Base handler for voice sessions using Deepgram's Voice Agent API.
 * 
 * Replaces the old BaseVoiceHandler which manually orchestrated STT/LLM/TTS.
 * This handler acts as a proxy: browser audio → Deepgram Voice Agent → browser.
 * It intercepts ConversationText events for persistence and tool execution.
 */
export abstract class BaseVoiceAgentHandler {
  protected ws: WebSocket;
  protected userId?: string;
  protected identifier: string;
  protected isActive: boolean = true;

  // Voice Agent connection
  protected voiceAgent: DeepgramVoiceAgentConnection | null = null;

  // Idle timeout state
  protected idleTimeout: NodeJS.Timeout | null = null;
  protected idleWarningTimeout: NodeJS.Timeout | null = null;
  protected lastActivityTime: number = Date.now();

  // Duration tracking
  protected activeDurationMs: number = 0;
  protected lastInteractionEndTime: number = Date.now();
  protected readonly MAX_SILENCE_GAP_MS = 30 * 1000;

  constructor(
    ws: WebSocket,
    identifier: string,
    userId?: string
  ) {
    this.ws = ws;
    this.identifier = identifier;
    this.userId = userId;

    this.setupBrowserConnectionHandlers();
    this.setupBrowserMessageHandlers();
  }

  // ── Abstract Methods ─────────────────────────────────────────────────────

  /** Initialize the handler (load data, create voice agent, etc.) */
  abstract initialize(): Promise<void>;

  /** Get the language for this session */
  protected abstract getLanguage(): SupportedLanguage;

  /** Build the Voice Agent settings for this session */
  protected abstract getVoiceAgentSettings(): Promise<VoiceAgentSettings>;

  /** Handle conversation text events (user or agent transcript) */
  protected abstract onConversationText(event: ConversationTextEvent): Promise<void>;

  /** Handle function call requests from the agent */
  protected abstract onFunctionCall(event: FunctionCallRequestEvent): Promise<void>;

  /** Handle control messages from the browser (subclass-specific) */
  protected abstract handleControlMessage(message: any): Promise<void>;

  // ── Voice Agent Management ─────────────────────────────────────────────

  /**
   * Create and connect the Deepgram Voice Agent
   */
  protected async connectVoiceAgent(): Promise<void> {
    const settings = await this.getVoiceAgentSettings();
    this.voiceAgent = new DeepgramVoiceAgentConnection(settings);

    // Set up Voice Agent event handlers
    this.voiceAgent.on("audio", (audioData: Buffer) => {
      // Relay agent audio to browser
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(audioData);
      }
    });

    this.voiceAgent.on("conversationText", async (event: ConversationTextEvent) => {
      this.resetIdleTimeout();
      
      // Send to browser for UI display
      this.send({
        type: "conversation_text",
        role: event.role,
        content: event.content,
      });

      // Also send legacy transcription event for backward compatibility
      if (event.role === "user") {
        this.send({
          type: "transcription",
          text: event.content,
          isFinal: true,
        });
      } else if (event.role === "assistant") {
        this.send({
          type: "audio_sent",
          text: event.content,
        });
      }

      // Let subclass handle persistence, extraction, etc.
      try {
        await this.onConversationText(event);
      } catch (error) {
        console.error(`[VoiceAgentHandler] Error in onConversationText:`, error);
      }
    });

    this.voiceAgent.on("functionCallRequest", async (event: FunctionCallRequestEvent) => {
      console.log(`[VoiceAgentHandler] Function call: ${event.function_name}`, event.input);
      try {
        await this.onFunctionCall(event);
      } catch (error) {
        console.error(`[VoiceAgentHandler] Error in onFunctionCall:`, error);
        // Respond with error so the agent can continue
        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          JSON.stringify({ error: "Function execution failed" })
        );
      }
    });

    this.voiceAgent.on("userStartedSpeaking", () => {
      this.resetIdleTimeout();
      // Track active duration
      const now = Date.now();
      const gap = now - this.lastInteractionEndTime;
      if (gap > 0) {
        this.activeDurationMs += Math.min(gap, this.MAX_SILENCE_GAP_MS);
      }
      // Send interrupt to browser to stop playback
      this.send({ type: "interrupt" });
      this.send({ type: "speech_start" });
    });

    this.voiceAgent.on("agentThinking", () => {
      this.send({ type: "agent_thinking" });
    });

    this.voiceAgent.on("agentStartedSpeaking", () => {
      this.send({ type: "agent_started_speaking" });
    });

    this.voiceAgent.on("agentAudioDone", () => {
      this.lastInteractionEndTime = Date.now();
      this.send({ type: "agent_audio_done" });
    });

    this.voiceAgent.on("settingsApplied", () => {
      console.log(`[VoiceAgentHandler] Voice Agent settings applied for ${this.identifier}`);
    });

    this.voiceAgent.on("error", (error: Error) => {
      console.error(`[VoiceAgentHandler] Voice Agent error (${this.identifier}):`, error);
      this.sendError("Voice agent error: " + error.message);
    });

    this.voiceAgent.on("close", () => {
      console.log(`[VoiceAgentHandler] Voice Agent connection closed for ${this.identifier}`);
    });

    // Connect
    await this.voiceAgent.connect();
    console.log(`[VoiceAgentHandler] Voice Agent connected for ${this.identifier}`);
  }

  /**
   * Reconnect the Voice Agent with new settings (e.g., language change)
   */
  protected async reconnectVoiceAgent(): Promise<void> {
    if (this.voiceAgent) {
      this.voiceAgent.close();
      this.voiceAgent = null;
    }
    await this.connectVoiceAgent();
  }

  // ── Browser Connection Handlers ────────────────────────────────────────

  private setupBrowserConnectionHandlers(): void {
    this.ws.on("close", async () => {
      await this.cleanup();
    });

    this.ws.on("error", (error) => {
      console.error(`[VoiceAgentHandler] Browser WebSocket error (${this.identifier}):`, error);
      this.cleanup();
    });
  }

  private setupBrowserMessageHandlers(): void {
    this.ws.on("message", async (data: Buffer) => {
      if (!this.isActive) return;

      this.resetIdleTimeout();

      try {
        // Try to parse as JSON (control messages)
        const message = JSON.parse(data.toString());

        // Handle audio configuration (legacy — ignored since Voice Agent handles this)
        if (message.type === "audio_config") {
          return;
        }

        // Handle ping
        if (message.type === "ping") {
          this.send({ type: "pong" });
          return;
        }

        // Rate limit checks for JSON messages
        const messageCheck = await checkMessageAllowed(this.identifier);
        if (!messageCheck.allowed) {
          this.send({
            type: "rate_limit",
            error: messageCheck.reason,
            retryAfter: messageCheck.retryAfter,
          });
          return;
        }

        await this.handleControlMessage(message);
      } catch {
        // Not JSON — treat as audio data from browser
        await this.handleBrowserAudio(data);
      }
    });
  }

  /**
   * Handle audio data from browser — relay to Voice Agent
   */
  private async handleBrowserAudio(audioData: Buffer): Promise<void> {
    // Check audio chunk rate limit
    const audioCheck = await checkAudioChunkAllowed(this.identifier);
    if (!audioCheck.allowed) return;

    if (!audioData || audioData.length === 0) return;

    // Relay to Voice Agent
    if (this.voiceAgent?.connected) {
      this.voiceAgent.sendAudio(audioData);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  protected send(data: any): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  protected sendError(message: string, code?: string): void {
    if (code) {
      const voiceError = createVoiceError(code as any, message);
      sendVoiceError(this.send.bind(this), voiceError);
    } else {
      this.send({ type: "error", error: message, code: code || "UNKNOWN_ERROR" });
    }
  }

  // ── Idle Timeout ───────────────────────────────────────────────────────

  protected resetIdleTimeout(): void {
    this.lastActivityTime = Date.now();

    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    if (this.idleWarningTimeout) clearTimeout(this.idleWarningTimeout);

    this.idleWarningTimeout = setTimeout(() => {
      this.send({
        type: "idle_warning",
        message: "Session will close in 30 seconds due to inactivity.",
        secondsRemaining: 30,
      });
    }, IDLE_TIMEOUT_MS - IDLE_WARNING_MS);

    this.idleTimeout = setTimeout(() => {
      this.send({ type: "idle_timeout" });
      this.cleanup();
      this.ws.close(1000, "Idle timeout");
    }, IDLE_TIMEOUT_MS);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  protected async cleanup(): Promise<void> {
    if (!this.isActive) return;
    this.isActive = false;

    // Close Voice Agent connection
    if (this.voiceAgent) {
      this.voiceAgent.close();
      this.voiceAgent = null;
    }

    // Clear timeouts
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    if (this.idleWarningTimeout) clearTimeout(this.idleWarningTimeout);

    // Subclasses should override and call super.cleanup()
  }
}
