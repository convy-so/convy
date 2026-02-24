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
  protected hasStartedAudio: boolean = false;
  protected settingsApplied: boolean = false; // Bug 5 fix: Track settings application state

  // Attribution for billing
  protected surveyId?: string;
  protected organizationId?: string | null;

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

  // Track the last injected user input to filter it from UI
  protected lastInjectedInput: string | null = null;

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

  /** Get optional initial user input to trigger AI generation (e.g. "Start conversation") */
  protected getInitialUserInput(): string | null {
    return null;
  }

  /** Build the Voice Agent settings for this session */
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
        // Log every 50th chunk to avoid spam, but confirm flow
        if (Math.random() < 0.05) {
          console.log(
            `[BaseVoiceAgent] Relaying audio chunk to browser: ${audioData.length} bytes (sample)`,
          );
        }
        this.ws.send(audioData);
      } else {
        console.warn(
          "[BaseVoiceAgent] Cannot relay audio: Browser WS not open",
        );
      }
    });

    this.voiceAgent.on(
      "conversationText",
      async (event: ConversationTextEvent) => {
        console.log(
          `[BaseVoiceAgent] Received text from agent (${event.role}): "${event.content.substring(0, 50)}..."`,
        );
        this.resetIdleTimeout();

        // Filter out the injected initial user message so it doesn't show in the UI
        if (
          event.role === "user" &&
          this.lastInjectedInput &&
          event.content.trim() === this.lastInjectedInput.trim()
        ) {
          console.log(
            `[BaseVoiceAgent] 🤫 Skipping display of injected initial user message: "${event.content.substring(0, 30)}..."`,
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
            `[VoiceAgentHandler] Error in onConversationText:`,
            error,
          );
        }
      },
    );

    this.voiceAgent.on(
      "functionCallRequest",
      async (event: FunctionCallRequestEvent) => {
        console.log(
          `[VoiceAgentHandler] Function call: ${event.function_name}`,
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
      console.log(
        "[BaseVoiceAgent] Event: userStartedSpeaking - Interrupting agent",
      );
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
      console.log("[BaseVoiceAgent] Event: agentThinking");
      this.send({ type: "agent_thinking" });
    });

    this.voiceAgent.on("agentStartedSpeaking", () => {
      console.log("[BaseVoiceAgent] Event: agentStartedSpeaking");
      this.send({ type: "agent_started_speaking" });
    });

    this.voiceAgent.on("agentAudioDone", () => {
      console.log("[BaseVoiceAgent] Event: agentAudioDone");
      this.lastInteractionEndTime = Date.now();
      this.send({ type: "agent_audio_done" });
    });

    this.voiceAgent.on("settingsApplied", () => {
      console.log(
        `[VoiceAgentHandler] Voice Agent settings applied for ${this.identifier}`,
      );
      this.settingsApplied = true;

      // If audio already started flowing but we were waiting for settings, inject now
      if (this.hasStartedAudio) {
        console.log(
          `[VoiceAgentHandler] Audio already started, triggering deferred injection...`,
        );
        this.triggerInitialInjection();
      }
    });

    this.voiceAgent.on("injectionRefused", () => {
      console.warn(
        `[VoiceAgentHandler] Injection refused for ${this.identifier}, retrying in 500ms...`,
      );
      setTimeout(() => this.triggerInitialInjection(), 500);
    });

    this.voiceAgent.on(
      "error",
      (error: { description: string; code?: string }) => {
        console.error(
          `[VoiceAgentHandler] Voice Agent error (${this.identifier}):`,
          error,
        );
        this.sendError("Voice agent error: " + error.description, error.code);
      },
    );

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
    // Reset audio state so we inject again on new connection
    this.hasStartedAudio = false;
    this.settingsApplied = false;
    await this.connectVoiceAgent();
  }

  private triggerInitialInjection(): void {
    const initialInput = this.getInitialUserInput();
    if (initialInput) {
      this.lastInjectedInput = initialInput;
      console.log(
        `[VoiceAgentHandler] Injecting initial user input: "${initialInput}"`,
      );
      setTimeout(() => {
        this.voiceAgent?.sendInjectUserMessage(initialInput);
      }, 100);
    }
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
      // Log occasional chunk to verify flow
      if (Math.random() < 0.05) {
        console.log(
          `[BaseVoiceAgent] 🎤 Relaying browser audio to Agent: ${audioData.length} bytes`,
        );
      }
      this.voiceAgent.sendAudio(audioData);

      // Fire initial injection ONCE, after audio is confirmed flowing AND settings are applied
      if (!this.hasStartedAudio) {
        this.hasStartedAudio = true;

        if (this.settingsApplied) {
          this.triggerInitialInjection();
        } else {
          console.log(
            `[VoiceAgentHandler] Audio started but waiting for settings confirmation before injecting...`,
          );
        }
      }
    } else {
      if (Math.random() < 0.01) {
        console.warn(
          `[BaseVoiceAgent] ⚠️ Cannot relay audio: Voice Agent NOT connected`,
        );
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  protected send(data: any): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      if (data.type !== "audio" && data.type !== "pong") {
        console.log(`[BaseVoiceAgent] Sending to browser: ${data.type}`);
      }
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn(
        `[BaseVoiceAgent] Cannot send to browser (closed): ${data.type}`,
      );
    }
  }

  protected sendError(description: string, code?: string): void {
    if (code) {
      const voiceError = createVoiceError(code as any, description);
      sendVoiceError(this.send.bind(this), voiceError);
    } else {
      this.send({ type: "error", description, code: code || "UNKNOWN_ERROR" });
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
