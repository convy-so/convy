import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { isAppLocale, type AppLocale } from "@/shared/i18n/config";

const localeMessageLoaders = {
  en: () => import("../messages/en.json"),
  fr: () => import("../messages/fr.json"),
  de: () => import("../messages/de.json"),
} satisfies Record<AppLocale, () => Promise<{ default: unknown }>>;

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const resolvedLocale: AppLocale =
    requestedLocale && isAppLocale(requestedLocale)
      ? requestedLocale
      : routing.defaultLocale;

  return {
    locale: resolvedLocale,
    messages: (await localeMessageLoaders[resolvedLocale]()).default,
  };
});
