import "server-only";

import { headers } from "next/headers";

import { auth, type AuthSessionWithUser } from "@/lib/auth";
import { getDatabaseConnectionInfo } from "@/lib/db/connection-mode";
import { isTransientDatabaseError } from "@/lib/db/errors";
import { env } from "@/lib/env";
import type { AppLocale } from "@/lib/i18n/config";
import { createLogger } from "@/lib/logger";
import type { PlatformRole } from "./roles";

const SUPPORTED_LOCALE_SET = new Set<string>(["en", "fr", "de"]);
const log = createLogger("auth-session");
const databaseInfo = getDatabaseConnectionInfo(env.DATABASE_URL);

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

function isTransientSessionLookupError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (isTransientDatabaseError(error)) return true;

  const message = error.message;
  const status =
    "status" in error ? String((error as { status?: unknown }).status) : "";
  const statusCode =
    "statusCode" in error
      ? String((error as { statusCode?: unknown }).statusCode)
      : "";
  const cause = "cause" in error ? (error as { cause?: unknown }).cause : null;
  const causeMessage = cause instanceof Error ? cause.message : "";
  const causeCode =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code?: unknown }).code)
      : "";

  if (
    message.includes("Failed to get session") &&
    (status === "INTERNAL_SERVER_ERROR" || statusCode === "500")
  ) {
    return true;
  }

  return [
    message,
    status,
    statusCode,
    causeMessage,
    causeCode,
  ].some((value) =>
    [
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "Connection terminated unexpectedly",
      "read ECONNRESET",
    ].some((token) => value.includes(token)),
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logSessionLookupFailure(error: unknown, attempt: number) {
  if (!(error instanceof Error)) {
    log.error("Session lookup failed", {
      attempt,
      db_mode: databaseInfo.mode,
      db_host: databaseInfo.host,
      db_port: databaseInfo.port,
      db_is_local: databaseInfo.isLocal,
      error_message: String(error),
    });
    return;
  }

  const cause = "cause" in error ? (error as { cause?: unknown }).cause : null;
  const causeError = cause instanceof Error ? cause : null;
  const causeCode =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code?: unknown }).code ?? "")
      : "";

  log.error("Session lookup failed", {
    attempt,
    db_mode: databaseInfo.mode,
    db_host: databaseInfo.host,
    db_port: databaseInfo.port,
    db_is_local: databaseInfo.isLocal,
    error_name: error.name,
    error_message: error.message,
    ...(causeError ? { cause_name: causeError.name, cause_message: causeError.message } : {}),
    ...(causeCode ? { cause_code: causeCode } : {}),
  });
}

export async function getCurrentSession(
  authHeaders?: Headers | string | null,
): Promise<AuthSessionWithUser | null> {
  const requestHeaders = await buildHeaders(authHeaders);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return normalizeSession(
        await auth.api.getSession({
          headers: requestHeaders,
        }),
      );
    } catch (error) {
      logSessionLookupFailure(error, attempt + 1);
      lastError = error;
      if (!isTransientSessionLookupError(error) || attempt === 2) {
        break;
      }

      await wait(attempt === 0 ? 150 : 400);
    }
  }

  if (isTransientSessionLookupError(lastError)) {
    throw new AuthError(
      "SERVICE_UNAVAILABLE",
      "Your session could not be verified because a required database connection was interrupted. Please try again.",
    );
  }

  throw lastError;
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
