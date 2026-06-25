import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getCachedTranslation, setCachedTranslation } from "./ai-cache";
import {
  appLocaleLabels,
  defaultAppLocale,
  isAppLocale,
  type AppLocale,
} from "@/shared/i18n/config";

export type SupportedLanguage = AppLocale;

/**
 * Translates a UI string contextually using AI
 */
export async function translateUIString(
  text: string,
  targetLanguage: SupportedLanguage,
  context: string = "General UI label",
): Promise<string> {
  if (targetLanguage === defaultAppLocale) return text;

  // 1. Check Cache
  const cached = await getCachedTranslation(text, targetLanguage);
  if (cached) return cached;

  // 2. Generate with AI
  const prompt = `Translate the following UI string from English to ${appLocaleLabels[targetLanguage]}.
Context: ${context} or similar application UI.

Rules:
- Keep it concise and suitable for buttons/labels.
- Preserve variables like {name} or {count}.
- Return ONLY the translated string.

English String: "${text}"
${appLocaleLabels[targetLanguage]} Translation:`;

  try {
    const { text: translation } = await generateText({
      model: google("gemini-2.5-flash-lite"),
      prompt,
      temperature: 0, // High precision
    });

    const result = translation.trim().replace(/^"|"$/g, "");

    // 3. Store in Cache
    await setCachedTranslation(text, targetLanguage, result);

    return result;
  } catch {
    return text; // Fallback to original
  }
}

/**
 * Detects the language of a given text
 */
export async function detectLanguage(
  text: string,
): Promise<SupportedLanguage | "unknown"> {
  if (!text || text.length < 3) return "unknown";

  const prompt = `Identify the language of the following text. 
Return ONLY the ISO 639-1 code (e.g., "en", "fr", "de", "es", "it"). 
If it is not one of [en, fr, de, es, it], return "unknown".

Text: "${text}"
Code:`;

  try {
    const { text: code } = await generateText({
      model: google("gemini-2.5-flash-lite"),
      prompt,
      temperature: 0,
    });

    const result = code.trim().toLowerCase().replace(/^"|"$/g, "");
    if (isAppLocale(result)) {
      return result;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Checks if a language code is supported
 */
export function isSupportedLanguage(code: string): code is SupportedLanguage {
  return isAppLocale(code);
}

