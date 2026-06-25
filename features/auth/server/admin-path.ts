import { normalizeAppLocale, type AppLocale } from "@/shared/i18n/config";

export const ADMIN_ROUTE_SEGMENT = "5Yeo2xyqejRrN9bhz8FqWRPITkRXGZEM4Yma2eV3UI";

export function getAdminAppPath(path = ""): string {
  const suffix = path
    ? path.startsWith("/")
      ? path
      : `/${path}`
    : "";
  return `/${ADMIN_ROUTE_SEGMENT}${suffix}`;
}

export function getLocalizedAdminAppPath(
  locale: AppLocale,
  path = "",
): string {
  return `/${normalizeAppLocale(locale)}${getAdminAppPath(path)}`;
}
