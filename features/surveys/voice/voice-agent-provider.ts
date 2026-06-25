import {
  DeepgramVoiceAgentConnection,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
  type VoiceAgentSettings,
} from "@/features/surveys/voice/deepgram-voice-agent";
import { getVoiceAgentProviderName } from "@/features/surveys/voice/provider-config";

export type VoiceAgentConnection = {
  readonly connected: boolean;
  on(event: "audio", listener: (audioData: Buffer) => void): void;
  on(
    event: "conversationText",
    listener: (payload: ConversationTextEvent) => void | Promise<void>,
  ): void;
  on(
    event: "functionCallRequest",
    listener: (payload: FunctionCallRequestEvent) => void | Promise<void>,
  ): void;
  on(event: "userStartedSpeaking", listener: () => void): void;
  on(event: "agentThinking", listener: () => void): void;
  on(event: "agentStartedSpeaking", listener: () => void): void;
  on(event: "agentAudioDone", listener: () => void): void;
  on(event: "settingsApplied", listener: () => void): void;
  on(event: "error", listener: (error: unknown) => void): void;
  connect(): Promise<void>;
  close(): void;
  sendAudio(audioData: Buffer): void;
  sendFunctionCallResponse(
    functionCallId: string,
    name: string,
    output: string,
  ): void;
  sendInjectUserMessage(text: string): void;
  updateThink(think: VoiceAgentSettings["agent"]["think"]): void;
};

export function createVoiceAgentConnection(
  settings: VoiceAgentSettings,
): VoiceAgentConnection {
  switch (getVoiceAgentProviderName()) {
    case "deepgram":
    default:
      return new DeepgramVoiceAgentConnection(settings);
  }
}

export type { ConversationTextEvent, FunctionCallRequestEvent, SupportedLanguage, VoiceAgentSettings };
