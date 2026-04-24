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
import type { SupportedVoiceLocale } from "@/lib/voice/voice-locales";

// ── Types ────────────────────────────────────────────────────────────────────

export type SupportedLanguage = SupportedVoiceLocale;

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
        keyterms?: string[];
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
    greeting?: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseConversationTextEvent(
  value: unknown,
): ConversationTextEvent | null {
  if (
    !isRecord(value) ||
    (value.role !== "user" && value.role !== "assistant") ||
    typeof value.content !== "string"
  ) {
    return null;
  }

  return {
    role: value.role,
    content: value.content,
  };
}

function parseFunctionCallRequestEvent(
  value: unknown,
): FunctionCallRequestEvent | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string"
  ) {
    return null;
  }

  let input: Record<string, unknown> = {};
  if (typeof value.arguments === "string") {
    try {
      const parsed = JSON.parse(value.arguments);
      input = isRecord(parsed) ? parsed : {};
    } catch {
      input = {};
    }
  }

  return {
    function_call_id: value.id,
    function_name: value.name,
    input,
  };
}

function getErrorCode(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }

  return "";
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
export const VOICE_AGENT_THINK_MODEL = "gpt-4.1-mini";

export class DeepgramVoiceAgentConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private isWelcomeReceived: boolean = false;
  private isSettingsApplied: boolean = false;
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
        this.isConnected = true;
        resolve();
      });

      this.ws.on("message", (data: Buffer, isBinary: boolean) => {
        this.handleMessage(data, isBinary);
      });

      this.ws.on("error", (error) => {
        this.emit("error", error);
        if (!this.isConnected) {
          reject(error);
        }
      });

      this.ws.on("close", (code, reason) => {
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

    this.sendJson(settingsMessage);
  }

  /**
   * Send raw audio data to the Voice Agent
   */
  sendAudio(audioData: Buffer): void {
    // v1 doc: "Do not send audio until you receive SettingsApplied."
    if (!this.isSettingsApplied) {
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  sendInjectAgentMessage(text: string): void {
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
    this.sendJson({
      type: "FunctionCallResponse",
      id: functionCallId,
      name,
      content: output,
    });
  }

  /**
   * Replace the entire Think provider configuration mid-conversation.
   * This is preferred for prompt updates as it replaces rather than appends.
   */
  updateThink(think: VoiceAgentSettings["agent"]["think"]): void {
    this.settings.agent.think = think;
    if (this.isWelcomeReceived) {
      this.sendJson({
        type: "UpdateThink",
        think,
      });
    }
  }

  /**
   * Add to the existing system prompt mid-conversation.
   * Note: This appends to the current prompt.
   */
  updatePrompt(prompt: string): void {
    if (this.isWelcomeReceived) {
      this.sendJson({
        type: "UpdatePrompt",
        prompt,
      });
    }
  }

  /**
   * Change the Speak model mid-conversation.
   */
  updateSpeak(speak: VoiceAgentSettings["agent"]["speak"]): void {
    if (speak) {
      this.settings.agent.speak = speak;
      if (this.isWelcomeReceived) {
        this.sendJson({
          type: "UpdateSpeak",
          speak,
        });
      }
    }
  }

  /**
   * Send updated settings (e.g., language change)
   */
  updateSettings(settings: VoiceAgentSettings): void {
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
      //  // Commented out to reduce noise
      this.emit("audio", data);
      return;
    }

    // String data = JSON event
    try {
      const message = JSON.parse(data.toString());
      if (!isRecord(message) || typeof message.type !== "string") {
        return;
      }
      this.handleJsonMessage(message as { type: string; [key: string]: unknown });
    } catch {
    }
  }

  private handleJsonMessage(message: { type: string; [key: string]: unknown }): void {
    switch (message.type) {
      case "Welcome":
        this.isWelcomeReceived = true;
        // v1 doc: send Settings only after Welcome, then start KeepAlive
        this.sendSettings();
        this.startKeepAlive();
        this.emit("welcome", message);
        break;

      case "SettingsApplied":
        this.isSettingsApplied = true;
        // v1 doc: audio streaming is now safe
        this.emit("settingsApplied", message);
        break;

      case "ConversationText":
        {
          const event = parseConversationTextEvent(message);
          if (event) {
            this.emit("conversationText", event);
          }
        }
        break;

      case "InjectionRefused":
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
            const event = parseFunctionCallRequestEvent(fn);
            if (event) {
              this.emit("functionCallRequest", event);
            }
          }
        }
        break;

      case "Error":
        this.emit("error", {
          description:
            typeof message.description === "string"
              ? message.description
              : JSON.stringify(message),
          code: getErrorCode(message.code),
        });
        break;

      case "Warning":
        this.emit("warning", message);
        break;

      case "ThinkUpdated":
        this.emit("thinkUpdated");
        break;

      case "PromptUpdated":
        this.emit("promptUpdated");
        break;

      case "SpeakUpdated":
        this.emit("speakUpdated");
        break;

      default:
        break;
    }
  }

  private sendJson(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      // Swallowed to reduce noise
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
  keyterms?: string[];
  conversationHistory?: Array<{ role: string; content: string }>;
  /**
   * When set, Deepgram's think block routes to our own endpoint instead of
   * calling the provider (OpenAI) directly. The endpoint must be OpenAI-
   * compatible (chat completions SSE format).
   *
   * This makes voice sessions as intelligent as text sessions — they use
   * the same ConductingSpecialist + domain skill bundle.
   */
  agentTurnEndpoint?: {
    url: string;
    sessionId: string;
    surveyId: string;
    internalKey: string;
  };
}): VoiceAgentSettings {
  const {
    language,
    tone = "casual",
    systemPrompt,
    greeting,
    functions,
    keyterms,
    conversationHistory,
    agentTurnEndpoint,
  } = options;

  const voiceModel = getVoiceModel(language, tone);

  const thinkBlock: VoiceAgentSettings["agent"]["think"] = {
    provider: {
      type: "open_ai",
      model: VOICE_AGENT_THINK_MODEL,
    },
    prompt: `${systemPrompt}\n\nRespond to the user in the language they are speaking to you in. If the user speaks Spanish, reply in natural Spanish. Match the language of each user message independently to provide seamless multilingual support.`,
    ...(functions && functions.length > 0
      ? {
          functions: functions.map((fn) => {
            const functionConfig = { ...fn };
            delete functionConfig.client_side;
            return functionConfig;
          }),
        }
      : {}),
  };

  // Wire up our own endpoint when provided
  if (agentTurnEndpoint) {
    thinkBlock.endpoint = {
      url: agentTurnEndpoint.url,
      headers: {
        "x-internal-key": agentTurnEndpoint.internalKey,
        "x-session-id": agentTurnEndpoint.sessionId,
        "x-survey-id": agentTurnEndpoint.surveyId,
      },
    };
  }

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
          endpointing: 500, // Wait 500ms of silence before endpointing user speech (300ms was too aggressive — caused fragmented transcriptions)
          ...(keyterms && keyterms.length > 0 ? { keyterms } : {}),
        },
      },
      think: thinkBlock,
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
