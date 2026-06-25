import "server-only";

import crypto from "node:crypto";

import { cookies, headers } from "next/headers";
import { z } from "zod";

import { env } from "@/shared/config/server-env";
import {
  AUTH_INTENT_COOKIE_NAME,
  AUTH_INTENT_KIND_VALUES,
  AUTH_INTENT_ROLE_VALUES,
  AUTH_INTENT_TTL_SECONDS,
  AUTH_SUPPORTED_LOCALES,
} from "@/shared/auth/constants";
import {
  defaultAppLocale,
  normalizeAppLocale,
  type AppLocale,
} from "@/shared/i18n/config";
import { localizeAppPath, sanitizeReturnTo } from "@/features/auth/server/redirect";

export const authIntentKindSchema = z.enum(AUTH_INTENT_KIND_VALUES);

export const authIntentRoleSchema = z.enum(AUTH_INTENT_ROLE_VALUES);

export const authIntentSchema = z.object({
  kind: authIntentKindSchema,
  desiredRole: authIntentRoleSchema.nullable(),
  invitationId: z.string().min(1).nullable(),
  returnTo: z.string().min(1).nullable(),
  locale: z.enum(AUTH_SUPPORTED_LOCALES),
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
});

export type AuthIntent = z.infer<typeof authIntentSchema>;
export type AuthIntentKind = z.infer<typeof authIntentKindSchema>;

function getSigningSecret() {
  return env.BETTER_AUTH_SECRET;
}

function signPayload(payload: string) {
  return crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");
}

function encodeIntent(intent: AuthIntent) {
  const payload = Buffer.from(JSON.stringify(intent), "utf8").toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function decodeIntentCookie(value: string): AuthIntent | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = signPayload(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const parsed = authIntentSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (parsed.expiresAt <= Date.now()) {
      return null;
    }
    return {
      ...parsed,
      locale: normalizeAppLocale(parsed.locale),
      returnTo: sanitizeReturnTo(parsed.returnTo),
    };
  } catch {
    return null;
  }
}

export function normalizeIdentityEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function buildAuthContinuePath(locale: AppLocale): string {
  return localizeAppPath(locale, "/auth/continue");
}

export function createAuthIntent(input: {
  kind: AuthIntentKind;
  desiredRole: "student" | "teacher" | null;
  invitationId?: string | null;
  returnTo?: string | null;
  locale?: string | null;
}): AuthIntent {
  const locale = normalizeAppLocale(input.locale, defaultAppLocale);
  const issuedAt = Date.now();
  return authIntentSchema.parse({
    kind: input.kind,
    desiredRole: input.desiredRole,
    invitationId: input.invitationId ?? null,
    returnTo: sanitizeReturnTo(input.returnTo) ?? null,
    locale,
    issuedAt,
    expiresAt: issuedAt + AUTH_INTENT_TTL_SECONDS * 1000,
  });
}

export async function setAuthIntentCookie(intent: AuthIntent) {
  (await cookies()).set(AUTH_INTENT_COOKIE_NAME, encodeIntent(intent), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    maxAge: AUTH_INTENT_TTL_SECONDS,
    path: "/",
  });
}

export async function clearAuthIntentCookie() {
  (await cookies()).set(AUTH_INTENT_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    maxAge: 0,
    path: "/",
  });
}

export async function readAuthIntentCookie(): Promise<AuthIntent | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(AUTH_INTENT_COOKIE_NAME)?.value;
  if (!value) return null;
  return decodeIntentCookie(value);
}

export async function readAuthIntentFromRequestHeaders(
  requestHeaders?: Headers | null,
): Promise<AuthIntent | null> {
  const headerSource = requestHeaders ?? new Headers(await headers());
  const cookieHeader = headerSource.get("cookie");
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(";").map((part) => part.trim());
  const entry = parts.find((part) =>
    part.startsWith(`${AUTH_INTENT_COOKIE_NAME}=`),
  );
  if (!entry) return null;

  return decodeIntentCookie(entry.slice(AUTH_INTENT_COOKIE_NAME.length + 1));
}

export function validateSignupIntent(intent: AuthIntent | null): AuthIntent {
  if (!intent || !intent.desiredRole) {
    throw new Error("Missing or invalid auth intent.");
  }

  if (intent.kind !== "direct-signup" && intent.kind !== "invite-signup") {
    throw new Error("Auth intent does not allow sign-up.");
  }

  if (intent.kind === "invite-signup" && (!intent.invitationId || intent.desiredRole !== "student")) {
    throw new Error("Invitation sign-up must target a student invite.");
  }

  return intent;
}

export function getIntentCookieName() {
  return AUTH_INTENT_COOKIE_NAME;
}
