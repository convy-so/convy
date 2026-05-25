import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";
import { appLocales, defaultAppLocale } from "@/lib/i18n/config";

export const routing = defineRouting({
  locales: [...appLocales],
  defaultLocale: defaultAppLocale,
  localePrefix: "always",
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
