import { createClient } from "@deepgram/sdk";
import { env } from "@/lib/env";

/**
 * Transcribe an audio buffer using Deepgram's Nova-2 model.
 * Optimized for high-accuracy research queries.
 */
export async function transcribeAudioBuffer(
  buffer: Buffer,
  language: string = "en",
): Promise<string> {
  const deepgram = createClient(env.DEEPGRAM_API_KEY);

  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    buffer,
    {
      model: "nova-2",
      language: language as any,
      smart_format: true,
      filler_words: false,
    },
  );

  if (error) {
    throw new Error(`Deepgram transcription failed: ${error.message}`);
  }

  const transcript = result.results?.channels[0]?.alternatives[0]?.transcript;
  
  if (!transcript) {
    throw new Error("No transcript generated from audio");
  }

  return transcript;
}
