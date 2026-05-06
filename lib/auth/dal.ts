import "server-only";

import { headers } from "next/headers";

import { auth, type AuthSessionWithUser } from "@/lib/auth";
import type { AppLocale } from "@/lib/i18n/config";

const SUPPORTED_LOCALE_SET = new Set<string>(["en", "fr", "de"]);

export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "EMAIL_NOT_VERIFIED" | "FORBIDDEN",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type PlatformRole = "student" | "teacher" | "expert" | "admin";

function isSupportedLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && SUPPORTED_LOCALE_SET.has(value);
}

function normalizeSession(
  session: Awaited<ReturnType<typeof auth.api.getSession>>,
): AuthSessionWithUser | null {
  if (!session) return null;

  const user = session.user;
  const preferredLanguage =
    "preferredLanguage" in user && isSupportedLocale(user.preferredLanguage)
      ? user.preferredLanguage
      : undefined;

  const uiLocale =
    "uiLocale" in user && isSupportedLocale(user.uiLocale)
      ? user.uiLocale
      : preferredLanguage;

  return {
    ...session,
    user: {
      ...user,
      uiLocale,
      preferredLanguage,
    },
  };
}

async function buildHeaders(authHeaders?: Headers | string | null): Promise<Headers> {
  if (authHeaders instanceof Headers) return authHeaders;
  if (typeof authHeaders === "string") return new Headers({ cookie: authHeaders });
  return new Headers(await headers());
}

export async function getCurrentSession(
  authHeaders?: Headers | string | null,
): Promise<AuthSessionWithUser | null> {
  return normalizeSession(
    await auth.api.getSession({
      headers: await buildHeaders(authHeaders),
    }),
  );
}

export async function getVerifiedSession(
  authHeaders?: Headers | string | null,
): Promise<AuthSessionWithUser> {
  const session = await getCurrentSession(authHeaders);
  if (!session) throw new AuthError("UNAUTHENTICATED");
  if (!session.user.emailVerified) throw new AuthError("EMAIL_NOT_VERIFIED");
  return session;
}

export type RolePrincipal = { role?: string | null; emailVerified?: boolean | null };

export function getPlatformRole(user: RolePrincipal | null | undefined): PlatformRole {
  if (!user) return "student";
  if (user.role === "admin" || user.role === "expert" || user.role === "teacher" || user.role === "student") {
    return user.role;
  }
  return "student";
}

export function isAdmin(user: RolePrincipal | null | undefined): boolean {
  return Boolean(user && user.emailVerified !== false && getPlatformRole(user) === "admin");
}

export function isExpert(user: RolePrincipal | null | undefined): boolean {
  if (!user || user.emailVerified === false) return false;
  const role = getPlatformRole(user);
  return role === "expert" || role === "admin";
}

export function assertAdmin(user: RolePrincipal | null | undefined): void {
  if (!isAdmin(user)) throw new AuthError("FORBIDDEN", "Admin access required");
}

export function assertExpert(user: RolePrincipal | null | undefined): void {
  if (!isExpert(user)) throw new AuthError("FORBIDDEN", "Expert access required");
}
