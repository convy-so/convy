/**
 * Deepgram Voice Agent API connection.
 *
 * This file now owns only the websocket protocol and event translation.
 * Voice model selection and settings construction live in
 * `deepgram-voice-agent-settings.ts`.
 */

import { EventEmitter } from "events";
import { WebSocket } from "ws";

import { env } from "@/shared/config/server-env";
import { parseJsonValue } from "@/shared/http/json";
import {
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type VoiceAgentSettings,
} from "./deepgram-voice-agent-settings";

export {
  buildVoiceAgentSettings,
  getVoiceModel,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
  type VoiceAgentFunction,
  type VoiceAgentSettings,
  VOICE_AGENT_THINK_MODEL,
} from "./deepgram-voice-agent-settings";

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
    const parsed = parseJsonValue(value.arguments);
    input = isRecord(parsed) ? parsed : {};
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

const VOICE_AGENT_ENDPOINT = "wss://agent.deepgram.com/v1/agent/converse";
const KEEP_ALIVE_INTERVAL_MS = 8000;

type VoiceAgentJsonMessage = Record<string, unknown> & {
  type: string;
};

function parseVoiceAgentJsonMessage(value: unknown): VoiceAgentJsonMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  return {
    ...value,
    type: value.type,
  };
}

export class DeepgramVoiceAgentConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  private isWelcomeReceived = false;
  private isSettingsApplied = false;
  private settings: VoiceAgentSettings;

  constructor(settings: VoiceAgentSettings) {
    super();
    this.settings = settings;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const apiKey = env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        reject(new Error("DEEPGRAM_API_KEY is not configured"));
        return;
      }

      this.ws = new WebSocket(VOICE_AGENT_ENDPOINT, {
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

  private sendSettings(): void {
    this.sendJson({
      type: "Settings",
      ...this.settings,
    });
  }

  sendAudio(audioData: Buffer): void {
    if (!this.isSettingsApplied) {
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  sendInjectAgentMessage(text: string): void {
    this.sendJson({
      type: "InjectAgentMessage",
      message: text,
    });
  }

  sendInjectUserMessage(text: string): void {
    this.sendJson({
      type: "InjectUserMessage",
      content: text,
    });
  }

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

  updateThink(think: VoiceAgentSettings["agent"]["think"]): void {
    this.settings.agent.think = think;
    if (this.isWelcomeReceived) {
      this.sendJson({
        type: "UpdateThink",
        think,
      });
    }
  }

  updatePrompt(prompt: string): void {
    if (this.isWelcomeReceived) {
      this.sendJson({
        type: "UpdatePrompt",
        prompt,
      });
    }
  }

  updateSpeak(speak: VoiceAgentSettings["agent"]["speak"]): void {
    if (!speak) {
      return;
    }

    this.settings.agent.speak = speak;
    if (this.isWelcomeReceived) {
      this.sendJson({
        type: "UpdateSpeak",
        speak,
      });
    }
  }

  updateSettings(settings: VoiceAgentSettings): void {
    this.settings = settings;
    if (this.isWelcomeReceived) {
      this.sendSettings();
    }
  }

  close(): void {
    this.stopKeepAlive();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  get settingsApplied(): boolean {
    return this.isSettingsApplied;
  }

  private handleMessage(data: Buffer | string, isBinary: boolean): void {
    if (isBinary) {
      this.emit("audio", data);
      return;
    }

    const message = parseVoiceAgentJsonMessage(parseJsonValue(data.toString()));
    if (!message) {
      // Ignore malformed provider messages.
      return;
    }

    this.handleJsonMessage(message);
  }

  private handleJsonMessage(message: VoiceAgentJsonMessage): void {
    switch (message.type) {
      case "Welcome":
        this.isWelcomeReceived = true;
        this.sendSettings();
        this.startKeepAlive();
        this.emit("welcome", message);
        break;

      case "SettingsApplied":
        this.isSettingsApplied = true;
        this.emit("settingsApplied", message);
        break;

      case "ConversationText": {
        const event = parseConversationTextEvent(message);
        if (event) {
          this.emit("conversationText", event);
        }
        break;
      }

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
    }
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      this.sendJson({ type: "KeepAlive" });
    }, KEEP_ALIVE_INTERVAL_MS);
  }
}
