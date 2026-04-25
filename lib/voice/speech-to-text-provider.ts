import { createClient } from "@deepgram/sdk";

import { env } from "@/lib/env";
import { logBraintrustTrace } from "@/lib/ai/braintrust";
import { getSpeechToTextProviderName } from "@/lib/voice/provider-config";
import {
  normalizeSpeechToTextLanguage,
  type SpeechToTextLanguage,
} from "@/lib/voice/voice-locales";

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

class DeepgramSpeechToTextProvider implements SpeechToTextProvider {
  async transcribeAudioBuffer(
    buffer: Buffer,
    language: SpeechToTextLanguage = "multi",
  ): Promise<SpeechToTextResult> {
    if (!env.DEEPGRAM_API_KEY) {
      throw new Error("DEEPGRAM_API_KEY is not configured");
    }

    const deepgram = createClient(env.DEEPGRAM_API_KEY);
    const normalizedLanguage = normalizeSpeechToTextLanguage(language);

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

    const detectedLanguage =
      result.results?.channels[0]?.detected_language ?? normalizedLanguage;

    logBraintrustTrace({
      event: "stt_transcription",
      input: { model: "nova-3", language: normalizedLanguage },
      output: { transcriptLength: transcript.length, detectedLanguage },
      metadata: { provider: "deepgram" },
    }).catch(() => undefined);

    return {
      transcript,
      language: detectedLanguage,
    };
  }
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
