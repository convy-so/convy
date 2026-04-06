import {
  defaultAppLocale,
  isAppLocale,
  type AppLocale,
} from "@/lib/i18n/config";

export type SupportedVoiceLocale = AppLocale;
export type SpeechToTextLanguage = SupportedVoiceLocale | "multi";

export function isSupportedVoiceLocale(
  value: unknown,
): value is SupportedVoiceLocale {
  return isAppLocale(value);
}

export function normalizeVoiceLocale(
  value: unknown,
  fallback: SupportedVoiceLocale = defaultAppLocale,
): SupportedVoiceLocale {
  return isSupportedVoiceLocale(value) ? value : fallback;
}

export function normalizeSpeechToTextLanguage(
  value: unknown,
): SpeechToTextLanguage {
  return isSupportedVoiceLocale(value) ? value : "multi";
}
