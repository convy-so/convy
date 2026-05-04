import { headers } from "next/headers";
import { auth, type AuthSessionWithUser } from "@/lib/auth";
import type { AppLocale } from "@/lib/i18n/config";

const SUPPORTED_LOCALES: readonly AppLocale[] = ["en", "fr", "de"];

function isSupportedLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as AppLocale);
}

function toTypedSession(
  session: Awaited<ReturnType<typeof auth.api.getSession>>,
): AuthSessionWithUser | null {
  if (!session) {
    return null;
  }

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

async function buildSessionHeaders(authHeaders?: Headers | string | null): Promise<Headers> {
  if (authHeaders instanceof Headers) {
    return authHeaders;
  }

  if (typeof authHeaders === "string") {
    return new Headers({ cookie: authHeaders });
  }

  const requestHeaders = await headers();
  return new Headers(requestHeaders);
}

/**
 * Retrieves the current session.
 * Accepts standard Headers, cookie strings, or handles automatic context retrieval.
 */
export async function getCurrentSession(
  authHeaders?: Headers | string | null
): Promise<AuthSessionWithUser | null> {

  return toTypedSession(
    await auth.api.getSession({
      headers: await buildSessionHeaders(authHeaders),
    }),
  );
}

/**
 * Retrieves a verified session or throws an error.
 * Used in server components and actions to gate access.
 */
export async function getVerifiedSession(
  authHeaders?: Headers | string | null,
): Promise<AuthSessionWithUser> {
  const session = await getCurrentSession(authHeaders);

  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }

  if (!session.user.emailVerified) {
    throw new Error("EMAIL_NOT_VERIFIED");
  }

  return session;
}
