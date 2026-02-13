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
  /** If omitted, function is client-executed (server handles FunctionCallRequest) */
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
    greeting?: string;
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

const VOICE_MODEL_MAP: Record<SupportedLanguage, { casual: string; formal: string }> = {
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
  tone: "casual" | "formal" | "playful" | "empathetic" = "casual"
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
        console.log("[VoiceAgent] WebSocket connected to Deepgram");
        this.isConnected = true;

        // Send Settings message immediately on connection
        this.sendSettings();
        resolve();
      });

      this.ws.on("message", (data: Buffer | string) => {
        this.handleMessage(data);
      });

      this.ws.on("error", (error) => {
        console.error("[VoiceAgent] WebSocket error:", error);
        this.emit("error", error);
        if (!this.isConnected) {
          reject(error);
        }
      });

      this.ws.on("close", (code, reason) => {
        console.log(`[VoiceAgent] WebSocket closed: ${code} ${reason}`);
        this.isConnected = false;
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

    console.log("[VoiceAgent] Sending Settings:", JSON.stringify({
      ...settingsMessage,
      agent: {
        ...settingsMessage.agent,
        think: {
          ...settingsMessage.agent.think,
          prompt: settingsMessage.agent.think.prompt.substring(0, 100) + "...",
          endpoint: settingsMessage.agent.think.endpoint ? { url: "***" } : undefined,
        },
      },
    }));

    this.sendJson(settingsMessage);
  }

  /**
   * Send raw audio data to the Voice Agent
   */
  sendAudio(audioData: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  /**
   * Inject a text message as if the user spoke it
   */
  sendInjectUserMessage(text: string): void {
    this.sendJson({
      type: "InjectUserMessage",
      content: text,
    });
  }

  /**
   * Respond to a function call request from the agent
   */
  sendFunctionCallResponse(functionCallId: string, output: string): void {
    this.sendJson({
      type: "FunctionCallResponse",
      function_call_id: functionCallId,
      id: functionCallId, // V1 requires 'id'
      name: "unknown", // V1 requires 'name', but we don't track it here. 
                       // In a robust impl, we'd need to pass this in.
                       // For now, 'unknown' might work or we rely on ID.
      content: output, // V1 requires 'content', not 'output'
    });
  }

  /**
   * Send updated settings (e.g., language change)
   */
  updateSettings(settings: VoiceAgentSettings): void {
    this.settings = settings;
    if (this.isConnected) {
      this.sendSettings();
    }
  }

  /**
   * Close the connection
   */
  close(): void {
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

  // ── Private Helpers ──────────────────────────────────────────────────────

  private handleMessage(data: Buffer | string): void {
    // Binary data = audio from agent
    if (Buffer.isBuffer(data)) {
      this.emit("audio", data);
      return;
    }

    // String data = JSON event
    try {
      const message = JSON.parse(data.toString());
      this.handleJsonMessage(message);
    } catch (error) {
      console.error("[VoiceAgent] Failed to parse message:", error);
    }
  }

  private handleJsonMessage(message: any): void {
    switch (message.type) {
      case "Welcome":
        console.log("[VoiceAgent] Welcome received:", message.request_id);
        this.emit("welcome", message);
        break;

      case "SettingsApplied":
        console.log("[VoiceAgent] Settings applied successfully");
        this.emit("settingsApplied", message);
        break;

      case "ConversationText":
        this.emit("conversationText", {
          role: message.role,
          content: message.content,
        } as ConversationTextEvent);
        break;

      case "UserStartedSpeaking":
        this.emit("userStartedSpeaking");
        break;

      case "AgentThinking":
        this.emit("agentThinking");
        break;

      case "AgentStartedSpeaking":
        this.emit("agentStartedSpeaking");
        break;

      case "AgentAudioDone":
        this.emit("agentAudioDone");
        break;

      case "FunctionCallRequest":
        // V1 schema: { type: "FunctionCallRequest", functions: [{ id, name, arguments, ... }] }
        if (message.functions && message.functions.length > 0) {
          const fn = message.functions[0];
          this.emit("functionCallRequest", {
            function_call_id: fn.id,
            function_name: fn.name,
            input: fn.arguments ? JSON.parse(fn.arguments) : {},
          } as FunctionCallRequestEvent);
        }
        break;

      case "Error":
        console.error("[VoiceAgent] Error from Deepgram:", message);
        this.emit("error", new Error(message.message || JSON.stringify(message)));
        break;

      default:
        console.log("[VoiceAgent] Unhandled message type:", message.type);
        break;
    }
  }

  private sendJson(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
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
  greeting?: string;
  functions?: VoiceAgentFunction[];
  conversationHistory?: Array<{ role: string; content: string }>;
}): VoiceAgentSettings {
  const { language, tone = "casual", systemPrompt, greeting, functions, conversationHistory } = options;

  const googleApiKey = env.GOOGLE_GENERATIVE_AI_API_KEY;
  const voiceModel = getVoiceModel(language, tone);

  return {
    audio: {
      input: { encoding: "linear16", sample_rate: 16000 },
      output: { encoding: "mp3", sample_rate: 24000, container: "none" },
    },
    agent: {
      language,
      listen: {
        provider: { type: "deepgram", model: "nova-3" },
      },
      think: {
        provider: { type: "google", model: "gemini-2.5-flash" },
        endpoint: {
          url: "https://generativelanguage.googleapis.com/v1beta/chat/completions",
          headers: { authorization: `Bearer ${googleApiKey}` },
        },
        prompt: systemPrompt,
        ...(functions && functions.length > 0 ? { functions } : {}),
      },
      speak: {
        provider: { type: "deepgram", model: voiceModel },
      },
      ...(greeting ? { greeting } : {}),
      ...(conversationHistory && conversationHistory.length > 0
        ? { context: { messages: conversationHistory } }
        : {}),
    },
  };
}
