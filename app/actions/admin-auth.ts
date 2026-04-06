"use server";

import { env } from "@/lib/env";
import { sendVerificationEmail } from "@/lib/email";
import { getRedisClient } from "@/lib/redis";
import { timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { storeAdminLoginToken } from "@/lib/admin/session";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";

const ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60;
const ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function requestAdminLogin(email: string, password: string) {
  const normalizedEmail = email.toLowerCase();
  const requestHeaders = await headers();
  const ipAddress = resolveTrustedClientIp(requestHeaders).ip ?? "unknown";

  const redis = getRedisClient();
  try {
    const throttleKey = `admin_login_attempts:${ipAddress}`;
    const attemptCount = await redis.incr(throttleKey);
    if (attemptCount === 1) {
      await redis.expire(throttleKey, ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS);
    }

    if (attemptCount > ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
      // Intentionally return success-shaped payload to avoid account enumeration signals.
      return { success: true };
    }
  } catch (error) {
    console.error("[admin-auth] rate limit check failed", {
      message: error instanceof Error ? error.message : "Unknown error",
      ipAddress,
    });
  }

  // Constant-time comparisons reduce timing side-channel risk.
  let isAdminEmail = false;
  for (const allowedEmail of env.ADMIN_EMAILS) {
    isAdminEmail = safeEqual(allowedEmail, normalizedEmail) || isAdminEmail;
  }
  void password;

  // We always return success to avoid enumerating admin emails or passwords
  if (!isAdminEmail) {
    return { success: true };
  }

  const token = await storeAdminLoginToken(normalizedEmail);

  // Use the existing email verification template but direct to our custom route
  const verificationUrl = `${env.APP_BASE_URL}/api/admin-verify/${token}`;

  await sendVerificationEmail({
    email,
    url: verificationUrl,
    name: "Admin",
  });

  return { success: true };
}
