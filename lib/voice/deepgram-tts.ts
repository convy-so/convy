
import { experimental_generateSpeech as generateSpeech } from "ai";
import { deepgram } from "@ai-sdk/deepgram";
import { env } from "@/lib/env";

/**
 * Deepgram Text-to-Speech Service using Aura-2
 * Cost: $0.015 per 1,000 characters
 */

// Cost constant for reuse
export const TTS_COST_PER_MILLION_CHARS = 15.00; // $15 per 1M chars (check pricing)

/**
 * Pre-cached greeting audio for instant playback on connection
 */
const greetingCache = new Map<string, Buffer>();

export const GREETING_TEXTS = {
  "en-survey-creation": "Hi! I'm here to help you create the perfect survey. Let's start with the basics - what's the main objective of your survey? What do you want to learn from your respondents?",
  "fr-survey-creation": "Bonjour! Je suis là pour vous aider à créer le sondage parfait. Commençons par les bases - quel est l'objectif principal de votre sondage?",
  "de-survey-creation": "Hallo! Ich bin hier, um Ihnen bei der Erstellung der perfekten Umfrage zu helfen. Beginnen wir mit den Grundlagen - was ist das Hauptziel Ihrer Umfrage?",
  "es-survey-creation": "¡Hola! Estoy aquí para ayudarte a crear la encuesta perfecta. Empecemos por lo básico: ¿cuál es el objetivo principal de tu encuesta?",
  "it-survey-creation": "Ciao! Sono qui per aiutarti a creare il sondaggio perfetto. Iniziamo dalle basi: qual è l'obiettivo principale del tuo sondaggio?",
} as const;

/**
 * Check if Deepgram credentials are configured
 */
export function validateDeepgramCredentials(): void {
  if (!env.DEEPGRAM_API_KEY) {
    throw new Error(
      `Deepgram credentials not configured. Voice features require DEEPGRAM_API_KEY environment variable.`
    );
  }
}

export interface TTSOptions {
  language?: string; // e.g. 'en-US'
  voice?: string; // Specific model ID like 'aura-2-asteria-en'
  // Deepgram doesn't use gender/pitch/speakingRate in same way as Google
  // but we keep interface for compatibility if needed or map to nearest equivalent
}

export interface TTSResult {
  audio: Buffer;
  cost: number; // Estimated cost in USD
  characterCount: number;
  duration: number; // Estimated duration in ms
}

export interface TTSError {
  error: string;
  code: string;
  retryable: boolean;
}

/**
 * Voice configurations for different languages and tones using Aura-2 models
 * Updated with correct multilingual Aura-2 models (Jan 2026)
 */
export const VOICE_PROFILES = {
  // English voices (Aura-1)
  "en-casual": { // Asteria is friendly/casual
    model: "aura-asteria-en",
    language: "en-US",
  },
  "en-formal": { // Athena is more professional
    model: "aura-athena-en",
    language: "en-US",
  },
  "en-playful": { // Luna is often used for energetic/younger
    model: "aura-luna-en",
    language: "en-US",
  },
  "en-empathetic": { // Helios for deeper/calm male voice
    model: "aura-helios-en",
    language: "en-US",
  },

  // French voices (Aura-2 multilingual)
  // Using Agathe (female, versatile) and Hector (male)
  "fr-casual": {
    model: "aura-2-agathe-fr", // Female, friendly and natural
    language: "fr-FR",
  },
  "fr-formal": {
    model: "aura-2-hector-fr", // Male, clear and professional
    language: "fr-FR",
  },

  // German voices (Aura-2 multilingual)
  // Using Viktoria (female, versatile) and Julius (male, featured)
  "de-casual": {
    model: "aura-2-viktoria-de", // Female, friendly and clear
    language: "de-DE",
  },
  "de-formal": {
    model: "aura-2-julius-de", // Male, professional (featured voice)
    language: "de-DE",
  },

  // Spanish voices (Aura-2 multilingual)
  // Using Celeste and Nestor (featured voices)
  "es-casual": {
    model: "aura-2-celeste-es", // Female, friendly (featured)
    language: "es-ES",
  },
  "es-formal": {
    model: "aura-2-nestor-es", // Male, professional (featured)
    language: "es-ES",
  },

  // Italian voices (Aura-2 multilingual)
  // Using Livia and Dionisio (featured voices)
  "it-casual": {
    model: "aura-2-livia-it", // Female, friendly (featured)
    language: "it-IT",
  },
  "it-formal": {
    model: "aura-2-dionisio-it", // Male, professional (featured)
    language: "it-IT",
  },
} as const;

/**
 * Deepgram TTS Service
 */
export class DeepgramTTSService {
  private totalCost: number = 0;
  private totalCharacters: number = 0;
  private requestCount: number = 0;

  constructor() {
    validateDeepgramCredentials();
    console.log("[Deepgram TTS] Service initialized successfully");
  }

  isReady(): boolean {
    return true;
  }

  /**
   * Synthesize text to speech using Vercel AI SDK
   */
  async synthesize(
    text: string,
    options: TTSOptions = {}
  ): Promise<TTSResult | TTSError> {
    try {
        if (!text || text.trim().length === 0) {
            return { error: "Empty text provided", code: "EMPTY_TEXT", retryable: false };
        }

        // Determine model/voice
        const modelId = options.voice || "aura-asteria-en"; 

        const startTime = Date.now();
        
        // Vercel AI SDK call
        // Note: Deepgram speech models use MP3 encoding by default with fixed sample rate
        // providerOptions are not supported for Deepgram speech models
        const { audio } = await generateSpeech({
            model: deepgram.speech(modelId),
            text: text,
        });

        const processingTime = Date.now() - startTime;
        const characterCount = text.length;
        
        // Calculate cost: $0.015 per 1,000 characters
        const cost = (characterCount / 1000) * 0.015;
        this.totalCost += cost;
        this.totalCharacters += characterCount;
        this.requestCount++;

        // Estimate duration (~15 chars per second roughly, varies by voice)
        const estimatedDuration = (characterCount / 15) * 1000;

        return {
            // Extract the actual audio data from GeneratedAudioFile
            audio: Buffer.from(audio.uint8Array),
            cost,
            characterCount,
            duration: estimatedDuration
        };

    } catch (error: any) {
        console.error("[Deepgram TTS] Synthesis error:", error);
        return {
            error: error.message || "Unknown synthesis error",
            code: "UNKNOWN_ERROR",
            retryable: true // Often network issues
        };
    }
  }

  /**
   * Synthesize with voice profile
   */
  async synthesizeWithProfile(
    text: string,
    profileKey: keyof typeof VOICE_PROFILES
  ): Promise<TTSResult | TTSError> {
    const profile = VOICE_PROFILES[profileKey];
    return this.synthesize(text, {
        voice: profile.model,
        language: profile.language
    });
  }

  /**
   * Synthesize for survey (compatibility wrapper)
   */
  async synthesizeForSurvey(
    text: string,
    tone: "formal" | "casual" | "playful" | "empathetic",
    language: "en" | "fr" | "de" | "es" | "it" = "en"
  ): Promise<TTSResult | TTSError> {
    const profileKey = `${language}-${tone}` as keyof typeof VOICE_PROFILES;
    if (!VOICE_PROFILES[profileKey]) {
        // Fallback to casual voice of same language
        return this.synthesizeWithProfile(text, `${language}-casual` as keyof typeof VOICE_PROFILES);
    }
    return this.synthesizeWithProfile(text, profileKey);
  }

  // Helper stats methods
   getStats() {
    return {
      totalCost: this.totalCost,
      totalCharacters: this.totalCharacters,
      requestCount: this.requestCount,
      averageCost: this.requestCount > 0 ? this.totalCost / this.requestCount : 0,
    };
  }
}

/**
 * Singleton instance
 */
let ttsInstance: DeepgramTTSService | null = null;

export function getDeepgramTTSService(): DeepgramTTSService {
  if (!ttsInstance) {
    ttsInstance = new DeepgramTTSService();
  }
  return ttsInstance;
}

// Compatibility exports
export function getTTSService() { return getDeepgramTTSService(); }

// ... existing helper functions (warmup, cache)
export function getCachedGreeting(key: string): Buffer | undefined {
  return greetingCache.get(key);
}

export function getGreetingText(key: keyof typeof GREETING_TEXTS): string {
    return GREETING_TEXTS[key];
}

export async function warmupGreetings(): Promise<void> {
    console.log("[Deepgram TTS] Warming up greeting cache...");
    const service = getDeepgramTTSService();
    const startTime = Date.now();
    let successCount = 0;

    for (const [key, text] of Object.entries(GREETING_TEXTS)) {
        try {
            const [lang] = key.split("-") as ["en" | "fr" | "de"];
            // Use casual voice for greetings
            const result = await service.synthesizeForSurvey(text, "casual", lang);
            
            if ("audio" in result) {
                greetingCache.set(key, result.audio);
                successCount++;
                console.log(`[Deepgram TTS] Cached greeting: ${key}`);
            }
        } catch (error) {
            console.error(`[Deepgram TTS] Failed to cache ${key}:`, error);
        }
    }
    const elapsed = Date.now() - startTime;
    console.log(`[Deepgram TTS] Warmup complete: ${successCount}/${Object.keys(GREETING_TEXTS).length} in ${elapsed}ms`);
}
