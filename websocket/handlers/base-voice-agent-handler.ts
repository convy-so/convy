import { WebSocket } from "ws";
import {
  checkMessageAllowed,
  checkAudioChunkAllowed,
} from "../middleware/rate-limit";
import {
  createVoiceAgentConnection,
  type VoiceAgentSettings,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
  type VoiceAgentConnection,
} from "@/lib/voice/voice-agent-provider";
import { logUsage } from "@/lib/billing/logger";

// Configuration constants
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_WARNING_MS = 30 * 1000;
const VAD_INTERRUPT_COOLDOWN_MS = 2500; // Defensive echo guard in case the client leaks agent audio back after playback starts.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorCode(value: unknown): string | undefined {
  return isRecord(value) && typeof value.code === "string"
    ? value.code
    : undefined;
}

function normalizeErrorPayload(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value)) {
    return value;
  }

  if (value instanceof Error) {
    return { message: value.message };
  }

  return { message: "Unknown error" };
}

/**
 * Base handler for voice sessions using the configured voice-agent provider.
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
  protected initialDirective: string | null = null;

  // Attribution for billing
  public surveyId: string | null | undefined;
  protected organizationId: string | null | undefined;

  // Voice Agent connection
  protected voiceAgent: VoiceAgentConnection | null = null;

  // Idle timeout state
  protected idleTimeout: NodeJS.Timeout | null = null;
  protected idleWarningTimeout: NodeJS.Timeout | null = null;
  protected lastActivityTime: number = Date.now();
  protected lastAgentSpeechStartTime: number = 0;

  // Duration tracking
  protected activeDurationMs: number = 0;
  protected lastInteractionEndTime: number = Date.now();
  protected readonly MAX_SILENCE_GAP_MS = 30 * 1000;

  constructor(ws: WebSocket, identifier: string, userId?: string) {
    this.ws = ws;
    this.identifier = identifier;
    this.userId = userId;

    this.setupBrowserConnectionHandlers();
    this.setupBrowserMessageHandlers();
  }

  public getSocket(): WebSocket {
    return this.ws;
  }

  // ── Abstract Methods ─────────────────────────────────────────────────────

  /** Initialize the handler (load data, create voice agent, etc.) */
  abstract initialize(): Promise<void>;

  /** Get the language for this session */
  protected abstract getLanguage(): SupportedLanguage;

  /** Build the Voice Agent settings for this session (subclass provides greeting in settings) */
  protected abstract getVoiceAgentSettings(): Promise<VoiceAgentSettings>;

  /** Handle conversation text events (user or agent transcript) */
  protected abstract onConversationText(
    event: ConversationTextEvent,
  ): Promise<void>;

  /** Handle function call requests from the agent */
  protected abstract onFunctionCall(
    event: FunctionCallRequestEvent,
  ): Promise<void>;

  /** Handle control messages from the browser (subclass-specific) */
  protected abstract handleControlMessage(
    message: Record<string, unknown>,
  ): Promise<void>;

  /** Get initial user input to trigger proactively (AI speaks first) */
  protected abstract getInitialUserInput(): string | null;

  /** Check if this is a brand new session (no messages yet) */
  protected abstract isNewSession(): boolean;

  // ── Voice Agent Management ─────────────────────────────────────────────

  /**
   * Create and connect the configured voice agent
   */
  protected async connectVoiceAgent(): Promise<void> {
    const settings = await this.getVoiceAgentSettings();
    this.voiceAgent = createVoiceAgentConnection(settings);

    // Set up Voice Agent event handlers
    this.voiceAgent.on("audio", (audioData: Buffer) => {
      // Relay agent audio to browser
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(audioData);
      }
    });

    this.voiceAgent.on(
      "conversationText",
      async (event: ConversationTextEvent) => {
        this.resetIdleTimeout();

        // Chain of Trust: Filter out internal directives
        if (event.role === "user" && event.content === this.initialDirective) {
          return;
        }

        // Send to browser for UI display
        this.send({
          type: "conversation_text",
          role: event.role,
          content: event.content,
        });

        // Let subclass handle persistence, extraction, etc.
        try {
          await this.onConversationText(event);
        } catch (error) {
          console.error(`[BaseVoiceAgentHandler] Error in onConversationText:`, error);
        }
      },
    );

    this.voiceAgent.on(
      "functionCallRequest",
      async (event: FunctionCallRequestEvent) => {
        try {
          await this.onFunctionCall(event);
        } catch (error) {
          console.error(`[VoiceAgentHandler] Error in onFunctionCall:`, error);
          // Respond with error so the agent can continue
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({ error: "Function execution failed" }),
          );
        }
      },
    );

    this.voiceAgent.on("userStartedSpeaking", () => {
      const now = Date.now();
      const timeSinceAgentStarted = now - this.lastAgentSpeechStartTime;

      if (timeSinceAgentStarted < VAD_INTERRUPT_COOLDOWN_MS) {
        return;
      }

      this.resetIdleTimeout();
      // Track active duration
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
      this.lastAgentSpeechStartTime = Date.now();
      this.send({ type: "agent_started_speaking" });
    });

    this.voiceAgent.on("agentAudioDone", () => {
      this.lastInteractionEndTime = Date.now();
      this.send({ type: "agent_audio_done" });
    });

    this.voiceAgent.on("settingsApplied", () => {
      this.send({
        type: "agent_ready",
        awaitingAgentIntro: this.isNewSession() || this.getInitialUserInput() !== null,
      });

      // Proactively trigger initial greeting if it's a new session
      if (this.isNewSession()) {
        const initialInput = this.getInitialUserInput();
        if (initialInput) {
          this.initialDirective = initialInput;
          // We use InjectUserMessage so the AI "hears" the instruction and responds naturally
          // based on its system prompt (e.g. greeting the user).
          // sendInjectAgentMessage would cause the AI to literally say the directive.
          this.voiceAgent?.sendInjectUserMessage(initialInput);
        }
      }
    });

    this.voiceAgent.on("error", (error: unknown) => {
      console.error(
        `[VoiceAgentHandler] Voice Agent error (${this.identifier}):`,
        error,
      );
      this.sendError(error, getErrorCode(error));
    });

    /*
    this.voiceAgent.on("close", () => {
    });
    */

    // Connect
    /*
    */
    await this.voiceAgent.connect();
    /*
    */
  }

  /**
   * Reconnect the Voice Agent with new settings (e.g., language change)
   */
  protected async reconnectVoiceAgent(): Promise<void> {
    if (this.voiceAgent) {
      this.voiceAgent.close();
      this.voiceAgent = null;
    }
    // Reset audio state so we inject again on new connection
    await this.connectVoiceAgent();
  }

  // ── Browser Connection Handlers ────────────────────────────────────────

  private setupBrowserConnectionHandlers(): void {
    this.ws.on("close", async () => {
      await this.cleanup();
    });

    this.ws.on("error", (error) => {
      console.error(
        `[VoiceAgentHandler] Browser WebSocket error (${this.identifier}):`,
        error,
      );
      this.cleanup();
    });
  }

  private setupBrowserMessageHandlers(): void {
    this.ws.on("message", async (data: Buffer, isBinary: boolean) => {
      //       if (!this.isActive) return;

      this.resetIdleTimeout();

      if (!isBinary) {
        try {
          // Try to parse as JSON (control messages)
          const strData = data.toString();

          const message = JSON.parse(strData);
          if (!isRecord(message) || typeof message.type !== "string") {
            return;
          }
          /*
          if (message.type !== "ping") {
          }
          */

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
        } catch (error) {
          console.error(
            `[BaseVoiceAgent] Failed to parse non-binary message as JSON:`,
            error,
          );
        }
      } else {
        // Treat as audio data from browser
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
    if (!audioCheck.allowed) {
      if (Math.random() < 0.01)
        console.warn(`[BaseVoiceAgent] Audio chunk dropped due to rate limit`);
      return;
    }

    if (!audioData || audioData.length === 0) return;

    // Relay to Voice Agent
    if (this.voiceAgent?.connected) {
      this.voiceAgent.sendAudio(audioData);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  public send(data: Record<string, unknown> | Buffer): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      if (!Buffer.isBuffer(data)) {
        const dataType =
          isRecord(data) && typeof data.type === "string" ? data.type : undefined;
        if (dataType !== "audio" && dataType !== "pong") {
          if (dataType === "error") {
            console.error(
              `[VoiceAgent] 📤 Error sent to browser:`,
              JSON.stringify(data, null, 2),
            );
          }
        }
      }
      try {
        this.ws.send(Buffer.isBuffer(data) ? data : JSON.stringify(data));
      } catch (err) {
        console.error(
          `[BaseVoiceAgent] Failed to stringify/send data:`,
          err,
          data,
        );
      }
    } else {
      const dataType =
        !Buffer.isBuffer(data) &&
        typeof data === "object" &&
        data !== null &&
        "type" in data &&
        typeof data.type === "string"
          ? data.type
          : "unknown";
      console.warn(
        `[BaseVoiceAgent] Cannot send to browser (closed): ${dataType}`,
      );
    }
  }

  protected sendError(errorPayload: unknown, code?: string): void {
    this.send({
      type: "error",
      error: normalizeErrorPayload(errorPayload),
      code,
    });
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

      // Log voice session usage
      if (this.activeDurationMs > 0) {
        logUsage({
          userId: this.userId,
          organizationId: this.organizationId || undefined,
          surveyId: this.surveyId || undefined,
          type: "voice_session",
          provider: "deepgram",
          modelName: "voice-agent-v1",
          durationMs: this.activeDurationMs,
        });
      }
    }

    // Clear timeouts
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    if (this.idleWarningTimeout) clearTimeout(this.idleWarningTimeout);

    // Subclasses should override and call super.cleanup()
  }
}
