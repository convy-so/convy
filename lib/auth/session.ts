import { headers } from "next/headers";
import { auth, type AuthSessionWithUser } from "@/lib/auth";
import type { AppLocale } from "@/lib/i18n/config";

type HeadersLike = {
  forEach?: (callback: (value: string, key: string) => void) => void;
};

function hasHeaderIterator(value: unknown): value is HeadersLike {
  return (
    !!value &&
    typeof value === "object" &&
    "forEach" in value &&
    typeof value.forEach === "function"
  );
}

function isSupportedLanguage(value: unknown): value is AppLocale {
  return (
    value === "en" ||
    value === "fr" ||
    value === "de" ||
    value === "es" ||
    value === "it"
  );
}

function toTypedSession(
  session: Awaited<ReturnType<typeof auth.api.getSession>>,
): AuthSessionWithUser | null {
  if (!session) {
    return null;
  }

  return {
    ...session,
    user: {
      ...session.user,
      uiLocale:
        "uiLocale" in session.user && isSupportedLanguage(session.user.uiLocale)
          ? session.user.uiLocale
          : "preferredLanguage" in session.user &&
              isSupportedLanguage(session.user.preferredLanguage)
            ? session.user.preferredLanguage
            : undefined,
      preferredLanguage:
        "preferredLanguage" in session.user &&
        isSupportedLanguage(session.user.preferredLanguage)
          ? session.user.preferredLanguage
          : undefined,
    },
  };
}

/**
 * Specifically handles cloning Next.js ReadonlyHeaders into a standard Headers object.
 * This resolves TypeScript compatibility issues while maintaining full header context.
 */
const cloneRequestHeaders = async (
  incoming?: HeadersLike,
): Promise<Headers> => {
  const source = incoming || (await headers());
  const result = new Headers();

  // Handle both standard Headers and Next.js ReadonlyHeaders
  if (typeof source.forEach === "function") {
    source.forEach((value: string, key: string) => {
      result.append(key, value);
    });
  }

  return result;
};

/**
 * Retrieves the current session.
 * Accepts standard Headers, cookie strings, or handles automatic context retrieval.
 */
export async function getCurrentSession(
  authHeaders?: Headers | string | null,
): Promise<AuthSessionWithUser | null> {
  let finalHeaders: Headers;

  if (authHeaders instanceof Headers) {
    finalHeaders = authHeaders;
  } else if (typeof authHeaders === "string") {
    finalHeaders = new Headers();
    finalHeaders.append("cookie", authHeaders);
  } else if (hasHeaderIterator(authHeaders)) {
    // Handle cases where ReadonlyHeaders are passed directly but fail instanceof
    finalHeaders = await cloneRequestHeaders(authHeaders);
  } else {
    // If no headers provided, clone from current request context
    finalHeaders = await cloneRequestHeaders();
  }

  return toTypedSession(await auth.api.getSession({
    headers: finalHeaders,
  }));
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
