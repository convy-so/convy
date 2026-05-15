import "server-only";

import { headers } from "next/headers";

import { auth, type AuthSessionWithUser } from "@/lib/auth";
import type { AppLocale } from "@/lib/i18n/config";
import type { PlatformRole } from "./roles";

const SUPPORTED_LOCALE_SET = new Set<string>(["en", "fr", "de"]);

export { AuthError, type PlatformRole, type RolePrincipal } from "./roles";
import { AuthError, getPlatformRole } from "./roles";

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

export const requireVerifiedSession = getVerifiedSession;

export async function requireRole(
  role: PlatformRole | PlatformRole[],
  authHeaders?: Headers | string | null,
): Promise<AuthSessionWithUser> {
  const session = await getVerifiedSession(authHeaders);
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(getPlatformRole(session.user))) {
    throw new AuthError("FORBIDDEN");
  }
  return session;
}

export async function requireStudentUser(authHeaders?: Headers | string | null) {
  return requireRole("student", authHeaders);
}

export async function requireTeacherUser(authHeaders?: Headers | string | null) {
  return requireRole(["teacher", "admin"], authHeaders);
}

export async function requireExpertUser(authHeaders?: Headers | string | null) {
  return requireRole(["expert", "admin"], authHeaders);
}

export {
  getPlatformRole,
  isAdmin,
  isExpert,
  assertAdmin,
  assertExpert,
} from "./roles";
