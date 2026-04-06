import { randomUUID } from "crypto";

import { env } from "@/lib/env";
import { getRedisClient } from "@/lib/redis";

const ADMIN_LOGIN_TOKEN_TTL_SECONDS = 15 * 60;
const ADMIN_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function extractCookieValue(cookieHeader: string | null | undefined, cookieName: string) {
  if (!cookieHeader) {
    return null;
  }

  const prefix = `${cookieName}=`;
  const match = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));

  return match ? match.slice(prefix.length) : null;
}

export async function storeAdminLoginToken(email: string): Promise<string> {
  const token = randomUUID();
  const redis = getRedisClient();
  await redis.set(`admin_login:${token}`, email.toLowerCase(), "EX", ADMIN_LOGIN_TOKEN_TTL_SECONDS);
  return token;
}

export async function consumeAdminLoginToken(token: string): Promise<string | null> {
  const redis = getRedisClient();
  const key = `admin_login:${token}`;
  const email = await redis.get(key);
  if (!email) {
    return null;
  }

  await redis.del(key);
  return email;
}

export async function createAdminSession(email: string): Promise<string> {
  const sessionToken = randomUUID();
  const redis = getRedisClient();
  await redis.set(`admin_session:${sessionToken}`, email.toLowerCase(), "EX", ADMIN_SESSION_TTL_SECONDS);
  return sessionToken;
}

export async function resolveAdminSessionEmail(cookieHeader: string | null | undefined) {
  const token = extractCookieValue(cookieHeader, "admin_session");
  if (!token) {
    return null;
  }

  const redis = getRedisClient();
  const email = await redis.get(`admin_session:${token}`);
  if (!email || !env.ADMIN_EMAILS.includes(email.toLowerCase())) {
    return null;
  }

  return email.toLowerCase();
}

export function getAdminSessionCookieConfig() {
  return {
    httpOnly: true as const,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/en/5Yeo2xyqejRrN9bhz8FqWRPITkRXGZEM4Yma2eV3UI",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  };
}
