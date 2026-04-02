import { createClient } from "@deepgram/sdk";

import { env } from "@/lib/env";

export type SupportedSpeechLocale = "en" | "fr" | "de" | "es" | "it";
export type SpeechToTextLanguage = SupportedSpeechLocale | "multi";
export type SpeechToTextProviderName = "deepgram";

export type SpeechToTextResult = {
  transcript: string;
  language: string;
};

export interface SpeechToTextProvider {
  transcribeAudioBuffer(
    buffer: Buffer,
    language?: SpeechToTextLanguage,
  ): Promise<SpeechToTextResult>;
}

function normalizeSpeechLanguage(
  language: string | undefined,
): SpeechToTextLanguage {
  return language === "en" ||
    language === "fr" ||
    language === "de" ||
    language === "es" ||
    language === "it"
    ? language
    : "multi";
}

class DeepgramSpeechToTextProvider implements SpeechToTextProvider {
  async transcribeAudioBuffer(
    buffer: Buffer,
    language: SpeechToTextLanguage = "multi",
  ): Promise<SpeechToTextResult> {
    if (!env.DEEPGRAM_API_KEY) {
      throw new Error("DEEPGRAM_API_KEY is not configured");
    }

    const deepgram = createClient(env.DEEPGRAM_API_KEY);
    const normalizedLanguage = normalizeSpeechLanguage(language);

    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: "nova-3",
        language: normalizedLanguage,
        smart_format: true,
        filler_words: false,
        punctuate: true,
      },
    );

    if (error) {
      throw new Error(`Speech transcription failed: ${error.message}`);
    }

    const transcript = result.results?.channels[0]?.alternatives[0]?.transcript;

    if (!transcript) {
      throw new Error("No transcript generated from audio");
    }

    return {
      transcript,
      language:
        result.results?.channels[0]?.detected_language ?? normalizedLanguage,
    };
  }
}

function getSpeechToTextProviderName(): SpeechToTextProviderName {
  const configuredProvider = process.env.VOICE_STT_PROVIDER;
  return configuredProvider === "deepgram" || !configuredProvider
    ? "deepgram"
    : "deepgram";
}

export function createSpeechToTextProvider(): SpeechToTextProvider {
  switch (getSpeechToTextProviderName()) {
    case "deepgram":
    default:
      return new DeepgramSpeechToTextProvider();
  }
}

export async function transcribeAudioBuffer(
  buffer: Buffer,
  language?: SpeechToTextLanguage,
): Promise<SpeechToTextResult> {
  return createSpeechToTextProvider().transcribeAudioBuffer(buffer, language);
}
