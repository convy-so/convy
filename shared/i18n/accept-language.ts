import { appLocales, defaultAppLocale, type AppLocale } from "@/shared/i18n/config";

function normalizeLanguageToken(token: string) {
  return token.trim().toLowerCase();
}

function extractPrimaryLocale(token: string): string {
  return normalizeLanguageToken(token).split("-")[0] ?? token;
}

export function resolveLocaleFromAcceptLanguage(
  headerValue: string | null | undefined,
): AppLocale {
  if (!headerValue) {
    return defaultAppLocale;
  }

  const preferred = headerValue
    .split(",")
    .map((entry) => entry.split(";")[0] ?? entry)
    .map(extractPrimaryLocale);

  for (const locale of preferred) {
    if (appLocales.includes(locale as AppLocale)) {
      return locale as AppLocale;
    }
  }

  return defaultAppLocale;
}

