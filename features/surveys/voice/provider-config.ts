import { env } from "@/shared/config/server-env";

export const speechToTextProviders = ["deepgram"] as const;
export type SpeechToTextProviderName = (typeof speechToTextProviders)[number];

export const voiceAgentProviders = ["deepgram"] as const;
export type VoiceAgentProviderName = (typeof voiceAgentProviders)[number];

function isProviderName<T extends string>(
  value: string | undefined,
  allowedProviders: readonly T[],
): value is T {
  if (typeof value !== "string") {
    return false;
  }

  return allowedProviders.some((provider) => provider === value);
}

export function getSpeechToTextProviderName(): SpeechToTextProviderName {
  return isProviderName(env.VOICE_STT_PROVIDER, speechToTextProviders)
    ? env.VOICE_STT_PROVIDER
    : "deepgram";
}

export function getVoiceAgentProviderName(): VoiceAgentProviderName {
  return isProviderName(env.VOICE_AGENT_PROVIDER, voiceAgentProviders)
    ? env.VOICE_AGENT_PROVIDER
    : "deepgram";
}
