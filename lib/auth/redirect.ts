import { normalizeAppLocale, type AppLocale } from "@/lib/i18n/config";
import { getAdminAppPath, getLocalizedAdminAppPath } from "@/lib/auth/admin-path";
import type { PlatformRole } from "@/lib/auth/roles";

const SAFE_PREFIXES = [
  "/dashboard",
  "/student",
  "/expert",
  "/expert-login",
  getAdminAppPath(),
  "/invite",
  "/expert-invite",
  "/auth/continue",
  "/auth/account-issue",
  "/sign-in",
  "/verify-email",
] as const;

export type AuthIssueReason = "invalid-role";

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

export function getLocalizedSignedInHomePath(
  locale: AppLocale,
  role: PlatformRole,
): string {
  if (role === "student") {
    return localizeAppPath(locale, "/student/dashboard");
  }

  if (role === "teacher") {
    return localizeAppPath(locale, "/dashboard");
  }

  if (role === "expert") {
    return localizeAppPath(locale, "/expert");
  }

  return getLocalizedAdminAppPath(locale);
}

export function getLocalizedAuthIssuePath(
  locale: AppLocale,
  reason: AuthIssueReason = "invalid-role",
): string {
  const params = new URLSearchParams({ reason });
  return `${localizeAppPath(locale, "/auth/account-issue")}?${params.toString()}`;
}
