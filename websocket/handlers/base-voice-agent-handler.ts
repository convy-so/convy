import { surveys } from "@/db/schema";
import { WebSocket } from "ws";
import {
  checkMessageAllowed,
  checkAudioChunkAllowed,
} from "../middleware/rate-limit";
import { createVoiceError, sendVoiceError } from "@/lib/voice/errors";
import {
  DeepgramVoiceAgentConnection,
  type VoiceAgentSettings,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
} from "@/lib/voice/deepgram-voice-agent";
import { logUsage } from "@/lib/billing/logger";

// Configuration constants
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_WARNING_MS = 30 * 1000;
const VAD_INTERRUPT_COOLDOWN_MS = 2500; // Ignore VAD after agent starts speaking (echo protection — prevents AI's own TTS from triggering false interrupts)

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
  protected initialDirective: string | null = null;

  // Attribution for billing
  protected surveyId?: string;
  protected organizationId?: string | null;

  // Voice Agent connection
  protected voiceAgent: DeepgramVoiceAgentConnection | null = null;

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
  protected abstract handleControlMessage(message: any): Promise<void>;

  /** Get initial user input to trigger proactively (AI speaks first) */
  protected abstract getInitialUserInput(): string | null;

  /** Check if this is a brand new session (no messages yet) */
  protected abstract isNewSession(): boolean;

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
        // Chain of Trust: Audio Egress
        if (Math.random() < 0.05) {
          console.log(
            `[ChainOfTrust] [Server] 🔊 Relaying agent audio to browser: ${audioData.length} bytes`,
          );
        }
        this.ws.send(audioData);
      } else {
        console.warn(
          "[ChainOfTrust] [Server] ⚠️ Cannot relay audio: Browser WS not open",
        );
      }
    });

    this.voiceAgent.on(
      "conversationText",
      async (event: ConversationTextEvent) => {
        console.log(
          `[ChainOfTrust] [Server] 🤖 Received conversation text from agent (${event.role}): "${event.content.substring(0, 50)}..."`,
        );
        this.resetIdleTimeout();

        // Chain of Trust: Filter out internal directives
        if (event.role === "user" && event.content === this.initialDirective) {
          console.log(
            `[ChainOfTrust] [Server] 🛡️ Filtered internal directive from browser relay: "${event.content.substring(0, 30)}..."`,
          );
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
          console.error(
            `[ChainOfTrust] [Server] ❌ Error in onConversationText:`,
            error,
          );
        }
      },
    );

    this.voiceAgent.on(
      "functionCallRequest",
      async (event: FunctionCallRequestEvent) => {
        console.log(
          `[ChainOfTrust] [Server] 🛠️ AI requested function call: ${event.function_name}`,
          event.input,
        );
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
        console.log(
          `[ChainOfTrust] [Server] 🛡️ Ignoring VAD interruption (cooldown: ${timeSinceAgentStarted}ms < ${VAD_INTERRUPT_COOLDOWN_MS}ms)`,
        );
        return;
      }

      console.log(
        "[ChainOfTrust] [Server] 🗣️ Deepgram detected user speech start (VAD). Interrupting agent.",
      );
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
      console.log("[ChainOfTrust] [Server] 🧠 Agent is thinking...");
      this.send({ type: "agent_thinking" });
    });

    this.voiceAgent.on("agentStartedSpeaking", () => {
      console.log(
        "[ChainOfTrust] [Server] 🗣️ Agent started speaking (TTS generation).",
      );
      this.lastAgentSpeechStartTime = Date.now();
      this.send({ type: "agent_started_speaking" });
    });

    this.voiceAgent.on("agentAudioDone", () => {
      console.log("[ChainOfTrust] [Server] 🤐 Agent finished speaking.");
      this.lastInteractionEndTime = Date.now();
      this.send({ type: "agent_audio_done" });
    });

    this.voiceAgent.on("settingsApplied", () => {
      console.log(
        `[ChainOfTrust] [Server] ✅ Voice Agent settings applied. Agent is ready for ${this.identifier}`,
      );
      this.send({ type: "agent_ready" });

      // Proactively trigger initial greeting if it's a new session
      if (this.isNewSession()) {
        const initialInput = this.getInitialUserInput();
        if (initialInput) {
          this.initialDirective = initialInput;
          console.log(
            `[BaseVoiceAgent] Brand new session detected. Injecting initial directive: "${initialInput}"`,
          );
          // We use InjectUserMessage so the AI "hears" the instruction and responds naturally
          // based on its system prompt (e.g. greeting the user).
          // sendInjectAgentMessage would cause the AI to literally say the directive.
          this.voiceAgent?.sendInjectUserMessage(initialInput);
        }
      }
    });

    this.voiceAgent.on("error", (error: any) => {
      console.error(
        `[VoiceAgentHandler] Voice Agent error (${this.identifier}):`,
        error,
      );
      this.sendError(error, error?.code);
    });

    this.voiceAgent.on("close", () => {
      console.log(
        `[VoiceAgentHandler] Voice Agent connection closed for ${this.identifier}`,
      );
    });

    // Connect
    console.log(
      `[BaseVoiceAgent] Connecting Voice Agent for ${this.identifier}...`,
    );
    await this.voiceAgent.connect();
    console.log(
      `[VoiceAgentHandler] Voice Agent connected for ${this.identifier}`,
    );
  }

  /**
   * Reconnect the Voice Agent with new settings (e.g., language change)
   */
  protected async reconnectVoiceAgent(): Promise<void> {
    console.log(
      `[BaseVoiceAgent] Reconnecting Voice Agent for ${this.identifier}...`,
    );
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
      console.log(
        `[BaseVoiceAgent] Browser WebSocket closed for ${this.identifier}`,
      );
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
      // console.log(`[BaseVoiceAgent] Raw WS message received: ${data.length} bytes, isBinary: ${isBinary}`);
      if (!this.isActive) return;

      this.resetIdleTimeout();

      if (!isBinary) {
        try {
          // Try to parse as JSON (control messages)
          const strData = data.toString();

          const message = JSON.parse(strData);
          if (message.type !== "ping") {
            console.log(
              `[BaseVoiceAgent] Received control message: ${message.type}`,
            );
          }

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
            console.warn(
              `[BaseVoiceAgent] Rate limit exceeded for ${this.identifier}`,
            );
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
      if (Math.random() < 0.02) {
        console.log(
          `[ChainOfTrust] [Server] 🎤 Relaying browser audio to Deepgram: ${audioData.length} bytes`,
        );
      }
      this.voiceAgent.sendAudio(audioData);
    } else {
      if (Math.random() < 0.01) {
        console.warn(
          `[ChainOfTrust] [Server] ⚠️ Cannot relay audio: Deepgram agent NOT connected`,
        );
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  protected send(data: any): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      if (data.type !== "audio" && data.type !== "pong") {
        if (data.type === "error") {
          console.error(
            `[ChainOfTrust] [Server] 📤 Sending ERROR to browser:`,
            JSON.stringify(data, null, 2),
          );
        } else {
          console.log(
            `[ChainOfTrust] [Server] 📤 Sending to browser: ${data.type}`,
          );
        }
      }
      try {
        this.ws.send(JSON.stringify(data));
      } catch (err) {
        console.error(
          `[BaseVoiceAgent] Failed to stringify/send data:`,
          err,
          data,
        );
      }
    } else {
      console.warn(
        `[BaseVoiceAgent] Cannot send to browser (closed): ${data.type}`,
      );
    }
  }

  protected sendError(errorPayload: any, code?: string): void {
    this.send({ type: "error", error: errorPayload, code });
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
          surveyId: this.surveyId,
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
