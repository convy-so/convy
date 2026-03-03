/**
 * Deepgram Voice Agent API Connection
 *
 * Wraps the Deepgram Voice Agent WebSocket API (v1) to provide a single
 * managed connection that handles STT→LLM→TTS internally.
 *
 * The server creates one of these per voice session, sends audio from the
 * browser to it, and relays events/audio back.
 */

import { WebSocket } from "ws";
import { EventEmitter } from "events";
import { env } from "@/lib/env";

// ── Types ────────────────────────────────────────────────────────────────────

export type SupportedLanguage = "en" | "fr" | "de" | "es" | "it";

export interface VoiceAgentFunction {
  name: string;
  description: string;
  parameters: Record<string, any>;
  // client_side MUST be true for the server to route FunctionCallRequests to our client.
  // If omitted/false, Deepgram tries to handle the function server-side (which fails for
  // our custom tools) and the FunctionCallRequest never reaches our onFunctionCall handler.
  client_side?: boolean;
  endpoint?: {
    url: string;
    method: string;
    headers?: Record<string, string>;
  };
}

export interface VoiceAgentSettings {
  audio?: {
    input?: { encoding?: string; sample_rate?: number };
    output?: { encoding?: string; sample_rate?: number; container?: string };
  };
  agent: {
    language?: string;
    listen?: { provider: { type: string; model?: string } };
    think: {
      provider: { type: string; model?: string };
      endpoint?: {
        url: string;
        headers?: Record<string, string>;
      };
      prompt: string;
      functions?: VoiceAgentFunction[];
    };
    speak?: { provider: { type: string; model?: string } };
    context?: {
      messages: Array<{ role: string; content: string }>;
    };
  };
}

export interface ConversationTextEvent {
  role: "user" | "assistant";
  content: string;
}

export interface FunctionCallRequestEvent {
  function_call_id: string;
  function_name: string;
  input: Record<string, any>;
}

// ── Voice/Language Mapping ───────────────────────────────────────────────────

const VOICE_MODEL_MAP: Record<
  SupportedLanguage,
  { casual: string; formal: string }
> = {
  en: { casual: "aura-asteria-en", formal: "aura-athena-en" },
  fr: { casual: "aura-2-agathe-fr", formal: "aura-2-hector-fr" },
  de: { casual: "aura-2-viktoria-de", formal: "aura-2-julius-de" },
  es: { casual: "aura-2-celeste-es", formal: "aura-2-nestor-es" },
  it: { casual: "aura-2-livia-it", formal: "aura-2-dionisio-it" },
};

/**
 * Get the TTS model name for a given language and tone
 */
export function getVoiceModel(
  language: SupportedLanguage,
  tone: "casual" | "formal" | "playful" | "empathetic" = "casual",
): string {
  const models = VOICE_MODEL_MAP[language] || VOICE_MODEL_MAP.en;
  // playful/empathetic map to casual for non-English
  if (tone === "formal") return models.formal;
  return models.casual;
}

// ── Connection Class ─────────────────────────────────────────────────────────

const VOICE_AGENT_ENDPOINT = "wss://agent.deepgram.com/v1/agent/converse";
const KEEP_ALIVE_INTERVAL_MS = 8000; // Send keep-alive every 8 seconds

export class DeepgramVoiceAgentConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  // v1 sequencing gates (per Deepgram message flow docs)
  private isWelcomeReceived: boolean = false; // Set on Welcome → enables Settings to be sent
  private isSettingsApplied: boolean = false; // Set on SettingsApplied → enables audio streaming
  private settings: VoiceAgentSettings;

  constructor(settings: VoiceAgentSettings) {
    super();
    this.settings = settings;
  }

  /**
   * Open the WebSocket connection to Deepgram Voice Agent
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const apiKey = env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        reject(new Error("DEEPGRAM_API_KEY is not configured"));
        return;
      }

      const url = `${VOICE_AGENT_ENDPOINT}`;

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${apiKey}`,
        },
      });

      this.ws.on("open", () => {
        console.log(
          "[VoiceAgent] WebSocket connected to Deepgram. Waiting for Welcome...",
        );
        this.isConnected = true;
        // v1 doc: "Do not send any messages until you receive the Welcome message."
        // Settings and KeepAlive are sent inside the Welcome handler below.
        resolve();
      });

      this.ws.on("message", (data: Buffer, isBinary: boolean) => {
        this.handleMessage(data, isBinary);
      });

      this.ws.on("error", (error) => {
        console.error("[VoiceAgent] WebSocket error:", error);
        this.emit("error", error);
        if (!this.isConnected) {
          reject(error);
        }
      });

      this.ws.on("close", (code, reason) => {
        console.log(
          `[VoiceAgent] WebSocket closed: Code=${code} Reason=${reason.toString()}`,
        );
        this.isConnected = false;
        this.isWelcomeReceived = false;
        this.isSettingsApplied = false;
        this.stopKeepAlive();
        this.emit("close", code, reason.toString());
      });
    });
  }

  /**
   * Send the Settings message to configure the agent
   */
  private sendSettings(): void {
    const settingsMessage = {
      type: "Settings",
      ...this.settings,
    };

    console.log("[VoiceAgent] Sending 'Settings' message to Deepgram...");
    console.log(
      "[VoiceAgent] Audio Config -> Input:",
      JSON.stringify(this.settings.audio?.input),
      "Output:",
      JSON.stringify(this.settings.audio?.output),
    );
    console.log(
      "[VoiceAgent] Agent Config -> Language:",
      this.settings.agent.language,
      "Model:",
      this.settings.agent.listen?.provider?.model,
    );

    this.sendJson(settingsMessage);
  }

  /**
   * Send raw audio data to the Voice Agent
   */
  sendAudio(audioData: Buffer): void {
    // v1 doc: "Do not send audio until you receive SettingsApplied."
    if (!this.isSettingsApplied) {
      return; // Drop audio silently — settings not yet confirmed
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  sendInjectAgentMessage(text: string): void {
    console.log(`[VoiceAgent] Injecting agent message: "${text}"`);
    // Spec: { type: "InjectAgentMessage", message: "..." }
    // Note: InjectUserMessage (old) used { type: "InjectUserMessage", content: "..." }
    // InjectAgentMessage triggers the AGENT to say something.
    this.sendJson({
      type: "InjectAgentMessage",
      message: text,
    });
  }

  /** @deprecated Use InjectAgentMessage instead (agent speaks proactively) */
  sendInjectUserMessage(text: string): void {
    console.log(`[VoiceAgent] Injecting user message (legacy): "${text}"`);
    this.sendJson({
      type: "InjectUserMessage",
      content: text,
    });
  }

  /**
   * Respond to a function call request from the agent
   */
  sendFunctionCallResponse(
    functionCallId: string,
    name: string,
    output: string,
  ): void {
    console.log(
      `[VoiceAgent] Sending function call response for ID: ${functionCallId}, Name: ${name}`,
    );
    this.sendJson({
      type: "FunctionCallResponse",
      id: functionCallId, // V1 requires 'id'
      name,
      content: output, // V2+ content, but V1 also uses content/output depending on specific SDK/spec nuances. The research confirmed 'content' and 'name' are required.
    });
  }

  /**
   * Send updated settings (e.g., language change)
   */
  updateSettings(settings: VoiceAgentSettings): void {
    console.log("[VoiceAgent] Updating settings...");
    this.settings = settings;
    if (this.isConnected) {
      this.sendSettings();
    }
  }

  /**
   * Close the connection
   */
  close(): void {
    console.log("[VoiceAgent] Closing connection...");
    this.stopKeepAlive();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /** True once SettingsApplied has been received — audio streaming is safe after this. */
  get settingsApplied(): boolean {
    return this.isSettingsApplied;
  }

  // ── Private Helpers ──────────────────────────────────────────────────────

  private handleMessage(data: Buffer | string, isBinary: boolean): void {
    // Binary data = audio from agent
    if (isBinary) {
      // console.log(`[VoiceAgent] Received audio chunk: ${data.length} bytes`); // Commented out to reduce noise
      this.emit("audio", data);
      return;
    }

    // String data = JSON event
    try {
      const message = JSON.parse(data.toString());
      console.log(`[VoiceAgent] 📥 Received JSON: ${message.type}`);
      this.handleJsonMessage(message);
    } catch (error) {
      console.error(
        "[VoiceAgent] Failed to parse message:",
        error,
        "Raw data:",
        data.toString().substring(0, 50),
      );
    }
  }

  private handleJsonMessage(message: any): void {
    switch (message.type) {
      case "Welcome":
        console.log("[VoiceAgent] Welcome received:", message.request_id);
        this.isWelcomeReceived = true;
        // v1 doc: send Settings only after Welcome, then start KeepAlive
        this.sendSettings();
        this.startKeepAlive();
        this.emit("welcome", message);
        break;

      case "SettingsApplied":
        console.log("[VoiceAgent] Settings applied successfully");
        this.isSettingsApplied = true;
        // v1 doc: audio streaming is now safe
        this.emit("settingsApplied", message);
        break;

      case "ConversationText":
        this.emit("conversationText", {
          role: message.role,
          content: message.content,
        } as ConversationTextEvent);
        break;

      case "InjectionRefused":
        console.warn(
          "[VoiceAgent] InjectionRefused received — will retry inject.",
        );
        this.emit("injectionRefused", message);
        break;

      case "UserStartedSpeaking":
        this.emit("userStartedSpeaking");
        break;

      case "AgentThinking":
        this.emit("agentThinking", message.content);
        break;

      case "AgentStartedSpeaking":
        this.emit("agentStartedSpeaking");
        break;

      case "AgentAudioDone":
        this.emit("agentAudioDone");
        break;

      case "FunctionCallRequest":
        // V1 schema: { type: "FunctionCallRequest", functions: [{ id, name, arguments, client_side, ... }] }
        if (message.functions && Array.isArray(message.functions)) {
          for (const fn of message.functions) {
            // Only emit if it's a client-side function
            if (fn.client_side) {
              this.emit("functionCallRequest", {
                function_call_id: fn.id,
                function_name: fn.name,
                input: fn.arguments ? JSON.parse(fn.arguments) : {},
              } as FunctionCallRequestEvent);
            } else {
              // Server-side function (handled internally by Deepgram or not relevant to client)
              console.log(
                `[VoiceAgent] Server-side function call received (ignoring): ${fn.name}`,
              );
            }
          }
        }
        break;

      case "Error":
        console.error("[VoiceAgent] Error from Deepgram:", message);
        this.emit("error", {
          description: message.description || JSON.stringify(message),
          code: message.code,
        });
        break;

      case "Warning":
        console.warn("[VoiceAgent] Warning from Deepgram:", message);
        this.emit("warning", message);
        break;

      default:
        console.log("[VoiceAgent] Unhandled message type:", message.type);
        break;
    }
  }

  private sendJson(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (data.type !== "Settings") {
        // Settings already logged in detail
        console.log(`[VoiceAgent] 📤 Sending JSON: ${data.type}`);
      }
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn(
        `[VoiceAgent] ⚠️ Cannot send JSON (WS not open): ${data.type}`,
      );
    }
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Start sending KeepAlive messages
   */
  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      this.sendJson({ type: "KeepAlive" });
    }, KEEP_ALIVE_INTERVAL_MS);
  }
}

// ── Factory Helper ───────────────────────────────────────────────────────────

/**
 * Build a VoiceAgentSettings object with sensible defaults
 */
export function buildVoiceAgentSettings(options: {
  language: SupportedLanguage;
  tone?: "casual" | "formal" | "playful" | "empathetic";
  systemPrompt: string;
  greeting?: string; // Native Deepgram greeting — spoken before waiting for user
  functions?: VoiceAgentFunction[];
  conversationHistory?: Array<{ role: string; content: string }>;
}): VoiceAgentSettings {
  const {
    language,
    tone = "casual",
    systemPrompt,
    greeting,
    functions,
    conversationHistory,
  } = options;

  const googleApiKey = env.GOOGLE_GENERATIVE_AI_API_KEY;
  const voiceModel = getVoiceModel(language, tone);

  return {
    audio: {
      // Input: 16000 Hz linear16 — matches our AudioWorklet which forces 16kHz context
      input: { encoding: "linear16", sample_rate: 16000 },
      // Output: 24000 Hz linear16 — Deepgram's native TTS sample rate
      output: { encoding: "linear16", sample_rate: 24000, container: "none" },
    },
    agent: {
      language,
      listen: {
        provider: {
          type: "deepgram",
          model: "nova-3",
        },
      },
      think: {
        provider: {
          type: "google",
        },
        // BYO Google endpoint: API key in x-goog-api-key header
        endpoint: {
          url: `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:streamGenerateContent?alt=sse`,
          headers: {
            "x-goog-api-key": googleApiKey || "",
          },
        },
        prompt: systemPrompt,
        ...(functions && functions.length > 0 ? { functions } : {}),
      },
      speak: {
        provider: { type: "deepgram", model: voiceModel },
      },
      // Set greeting so Deepgram speaks first — no InjectAgentMessage needed
      ...(greeting ? { greeting } : {}),
      ...(conversationHistory && conversationHistory.length > 0
        ? {
            context: {
              messages: conversationHistory.map((m) => ({
                type: "History" as const,
                role: m.role as "user" | "assistant",
                content: m.content,
              })),
            },
          }
        : {}),
    },
  };
}
