import { normalizeAppLocale, type AppLocale } from "@/lib/i18n/config";
import { getAdminAppPath } from "@/lib/auth/admin-path";

const SAFE_PREFIXES = [
  "/dashboard",
  "/student",
  "/expert",
  "/expert-login",
  getAdminAppPath(),
  "/invite",
  "/expert-invite",
  "/auth/continue",
  "/sign-in",
  "/verify-email",
] as const;

function stripLocalePrefix(path: string): string {
  const segments = path.split("/");
  const maybeLocale = segments[1];

  if (maybeLocale === "en" || maybeLocale === "fr" || maybeLocale === "de") {
    return `/${segments.slice(2).join("/")}`.replace(/\/+$/, "") || "/";
  }

  return path.replace(/\/+$/, "") || "/";
}

export function isSafeLocalReturnTo(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;

  try {
    const normalized = stripLocalePrefix(new URL(value, "https://local.invalid").pathname);
    return SAFE_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
    );
  } catch {
    return false;
  }
}

export function sanitizeReturnTo(value: string | null | undefined): string | null {
  return isSafeLocalReturnTo(value) ? value : null;
}

export function localizeAppPath(locale: AppLocale, path: string): string {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  const normalized = stripLocalePrefix(safePath);
  return `/${normalizeAppLocale(locale)}${normalized === "/" ? "" : normalized}`;
}
