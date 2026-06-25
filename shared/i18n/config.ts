export const appLocales = ["en", "fr", "de"] as const;

export type AppLocale = (typeof appLocales)[number];

export const defaultAppLocale: AppLocale = "en";

export const appLocaleSet = new Set<string>(appLocales);

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && appLocaleSet.has(value);
}

export function normalizeAppLocale(
  value: unknown,
  fallback: AppLocale = defaultAppLocale,
): AppLocale {
  return isAppLocale(value) ? value : fallback;
}

export const appLocaleLabels: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
};
