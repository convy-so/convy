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
import { type SurveyLanguage } from "@/lib/types/survey-flow";

// ── Types ────────────────────────────────────────────────────────────────────

export type SupportedLanguage = SurveyLanguage;

export interface VoiceAgentFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
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
    listen?: {
      provider: {
        type: string;
        model?: string;
        version?: string;
        language?: string;
        smart_format?: boolean;
        endpointing?: number;
      };
    };
    think: {
      provider: { type: string; model?: string };
      endpoint?: {
        url: string;
        headers?: Record<string, string>;
      };
      prompt: string;
      functions?: VoiceAgentFunction[];
    };
    speak?: {
      provider: {
        type: string;
        model?: string;
        model_id?: string;
      };
    };
    context?: {
      messages: Array<{ role: string; content: string }>;
    };
  };
  flags?: {
    history?: boolean;
  };
}

export interface ConversationTextEvent {
  role: "user" | "assistant";
  content: string;
}

export interface FunctionCallRequestEvent {
  function_call_id: string;
  function_name: string;
  input: Record<string, unknown>;
}

// ── Voice/Language Mapping ───────────────────────────────────────────────────

const VOICE_MODEL_MAP: Record<
  SupportedLanguage,
  { casual: string; formal: string; empathetic: string }
> = {
  en: {
    casual: "aura-2-asteria-en",
    formal: "aura-2-orpheus-en",
    empathetic: "aura-2-vesta-en",
  },
  fr: {
    casual: "aura-2-agathe-fr",
    formal: "aura-2-hector-fr",
    empathetic: "aura-2-agathe-fr",
  },
  de: {
    casual: "aura-2-viktoria-de",
    formal: "aura-2-fabian-de",
    empathetic: "aura-2-viktoria-de",
  },
  es: {
    casual: "aura-2-celeste-es",
    formal: "aura-2-nestor-es",
    empathetic: "aura-2-celeste-es",
  },
  it: {
    casual: "aura-2-livia-it",
    formal: "aura-2-dionisio-it",
    empathetic: "aura-2-livia-it",
  },
};

/**
 * Get the TTS model name for a given language and tone
 */
export function getVoiceModel(
  language: SupportedLanguage,
  tone: "casual" | "formal" | "playful" | "empathetic" = "casual",
): string {
  const models = VOICE_MODEL_MAP[language] || VOICE_MODEL_MAP.en;
  if (tone === "formal") return models.formal;
  if (tone === "empathetic") return models.empathetic; // now actually used
  return models.casual; // covers "casual" and "playful"
}

// ── Connection Class ─────────────────────────────────────────────────────────

const VOICE_AGENT_ENDPOINT = "wss://agent.deepgram.com/v1/agent/converse";
const KEEP_ALIVE_INTERVAL_MS = 8000;

export class DeepgramVoiceAgentConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  // v1 sequencing gates (per Deepgram message flow docs)
  private isWelcomeReceived: boolean = false;
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
          "[ChainOfTrust] [External:Deepgram] ✅ WebSocket connected to Deepgram. Handshake successful.",
        );
        this.isConnected = true;
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
          `[ChainOfTrust] [External:Deepgram] 🔴 WebSocket closed: Code=${code} Reason=${reason.toString()}`,
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

    console.log(
      "[ChainOfTrust] [External:Deepgram] 📤 Sending 'Settings' payload to Deepgram.",
    );
    console.log(
      `[ChainOfTrust] [External:Deepgram] Agent Config: Lang=${this.settings.agent.listen?.provider?.language} Model=${this.settings.agent.listen?.provider?.model}`,
    );

    console.log(
      "[ChainOfTrust] [External:Deepgram] 🔍 RAW SETTINGS JSON:\n",
      JSON.stringify(settingsMessage, null, 2),
    );

    this.sendJson(settingsMessage);
  }

  /**
   * Send raw audio data to the Voice Agent
   */
  sendAudio(audioData: Buffer): void {
    // v1 doc: "Do not send audio until you receive SettingsApplied."
    if (!this.isSettingsApplied) {
      if (Math.random() < 0.01) {
        console.warn(
          "[ChainOfTrust] [External:Deepgram] ⚠️ Dropping audio: Settings not yet applied.",
        );
      }
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (Math.random() < 0.05) {
        console.log(
          `[ChainOfTrust] [External:Deepgram] 📤 Forwarding audio to Deepgram: ${audioData.length} bytes`,
        );
      }
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
      `[ChainOfTrust] [External:Deepgram] 📤 Sending FunctionCallResponse for ${name} (ID: ${functionCallId})`,
    );
    this.sendJson({
      type: "FunctionCallResponse",
      id: functionCallId,
      name,
      content: output,
    });
  }

  /**
   * Send updated settings (e.g., language change)
   */
  updateSettings(settings: VoiceAgentSettings): void {
    console.log("[VoiceAgent] Updating settings...");
    this.settings = settings;
    // We must only send settings if we have already received the Welcome message from Deepgram.
    if (this.isWelcomeReceived) {
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
      if (message.type !== "KeepAliveResponse") {
        console.log(
          `[ChainOfTrust] [External:Deepgram] 📥 Received JSON message: ${message.type}`,
        );
      }
      this.handleJsonMessage(message);
    } catch (error) {
      console.error(
        "[ChainOfTrust] [External:Deepgram] ❌ Failed to parse JSON from Deepgram:",
        error,
        data.toString().substring(0, 100),
      );
    }
  }

  private handleJsonMessage(message: Record<string, unknown>): void {
    const type = message["type"] as string;
    const msg = message as Record<string, unknown> & {
      role?: string;
      content?: string;
      request_id?: string;
      description?: string;
      code?: string;
      functions?: Array<{
        id: string;
        name: string;
        arguments: string;
        client_side: boolean;
      }>;
    };

    switch (type) {
      case "Welcome":
        console.log("[VoiceAgent] Welcome received:", msg.request_id);
        this.isWelcomeReceived = true;
        this.sendSettings();
        this.startKeepAlive();
        this.emit("welcome", msg);
        break;

      case "SettingsApplied":
        console.log(
          "[ChainOfTrust] [External:Deepgram] ✅ Settings applied successfully. Audio streaming enabled.",
        );
        this.isSettingsApplied = true;
        this.emit("settingsApplied", msg);
        break;

      case "ConversationText":
        this.emit("conversationText", {
          role: msg.role as "user" | "assistant",
          content: msg.content as string,
        } as ConversationTextEvent);
        break;

      case "InjectionRefused":
        console.warn(
          "[VoiceAgent] InjectionRefused received — will retry inject.",
        );
        this.emit("injectionRefused", msg);
        break;

      case "UserStartedSpeaking":
        this.emit("userStartedSpeaking");
        break;

      case "AgentThinking":
        this.emit("agentThinking", msg.content);
        break;

      case "AgentStartedSpeaking":
        this.emit("agentStartedSpeaking");
        break;

      case "AgentAudioDone":
        this.emit("agentAudioDone");
        break;

      case "FunctionCallRequest":
        if (msg.functions && Array.isArray(msg.functions)) {
          for (const fn of msg.functions) {
            if (fn.client_side) {
              this.emit("functionCallRequest", {
                function_call_id: fn.id,
                function_name: fn.name,
                input: fn.arguments ? JSON.parse(fn.arguments) : {},
              } as FunctionCallRequestEvent);
            } else {
              console.log(
                `[VoiceAgent] Server-side function call received (ignoring): ${fn.name}`,
              );
            }
          }
        }
        break;

      case "Error":
        console.error("[VoiceAgent] Error from Deepgram:", msg);
        this.emit("error", {
          description: msg.description || JSON.stringify(msg),
          code: msg.code,
        });
        break;

      case "Warning":
        console.warn("[VoiceAgent] Warning from Deepgram:", msg);
        this.emit("warning", msg);
        break;

      default:
        console.log("[VoiceAgent] Unhandled message type:", type);
        break;
    }
  }

  private sendJson(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (data.type !== "Settings" && data.type !== "KeepAlive") {
        console.log(
          `[ChainOfTrust] [External:Deepgram] 📤 Sending JSON message: ${data.type}`,
        );
      }
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn(
        `[ChainOfTrust] [External:Deepgram] ⚠️ Cannot send JSON (WS not open): ${data.type}`,
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

  const voiceModel = getVoiceModel(language, tone);

  return {
    flags: {
      history: true,
    },
    audio: {
      // Input: 16000 Hz linear16 — matches our AudioWorklet which forces 16kHz context
      input: { encoding: "linear16", sample_rate: 16000 },
      // Output: 24000 Hz linear16 — Deepgram's native TTS sample rate
      output: { encoding: "linear16", sample_rate: 24000, container: "none" },
    },
    agent: {
      listen: {
        provider: {
          type: "deepgram",
          model: "nova-3",
          version: "v1",
          language: "multi",
          smart_format: true,
          endpointing: 300, // Wait 300ms of silence before endpointing user speech
        },
      },
      think: {
        provider: {
          type: "open_ai",
          model: "gpt-4o-mini",
        },
        prompt: `${systemPrompt}\n\nRespond to the user in the language they are speaking to you in. If the user speaks Spanish, reply in natural Spanish. Match the language of each user message independently to provide seamless multilingual support.`,
        ...(functions && functions.length > 0
          ? {
              functions: functions.map((f) => {
                const rest = { ...f };
                delete rest.client_side;
                return rest;
              }),
            }
          : {}),
      },
      speak: {
        provider: {
          type: "deepgram",
          model: voiceModel,
        },
      },
      // Set greeting so Deepgram speaks first — no InjectAgentMessage needed
      ...(greeting ? { greeting } : {}),
      ...(conversationHistory && conversationHistory.length > 0
        ? {
            context: {
              messages: conversationHistory.map((m) => ({
                type: "History" as const,
                role: (m.role === "user" ? "user" : "assistant") as
                  | "user"
                  | "assistant",
                content: m.content,
              })),
            },
          }
        : {}),
    },
  };
}
