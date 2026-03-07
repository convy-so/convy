import { headers } from "next/headers";
import { auth, type AuthSessionWithUser } from "@/lib/auth";
import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

/**
 * Specifically handles cloning Next.js ReadonlyHeaders into a standard Headers object.
 * This resolves TypeScript compatibility issues while maintaining full header context.
 */
const cloneRequestHeaders = async (
  incoming?: Headers | ReadonlyHeaders,
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
  } else if (
    authHeaders &&
    typeof (authHeaders as { forEach?: Function }).forEach === "function"
  ) {
    // Handle cases where ReadonlyHeaders are passed directly but fail instanceof
    finalHeaders = await cloneRequestHeaders(authHeaders as Headers);
  } else {
    // If no headers provided, clone from current request context
    finalHeaders = await cloneRequestHeaders();
  }

  return auth.api.getSession({
    headers: finalHeaders,
  });
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
