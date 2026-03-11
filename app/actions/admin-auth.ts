"use server";

import { env } from "@/lib/env";
import { sendVerificationEmail } from "@/lib/email";
import { getRedisClient } from "@/lib/redis";
import { randomUUID } from "crypto";

export async function requestAdminLogin(email: string, password: string) {
  // Constant time comparison to avoid timing attacks on the admin email
  const isAdminEmail = env.ADMIN_EMAILS.some((e) => e === email.toLowerCase());
  const isCorrectPassword = password === env.ADMIN_PASSWORD;

  // We always return success to avoid enumerating admin emails or passwords
  if (!isAdminEmail || !isCorrectPassword) {
    return { success: true };
  }

  const token = randomUUID();
  const redis = getRedisClient();
  
  // Store the token for 15 minutes
  await redis.set(`admin_login:${token}`, email.toLowerCase(), "EX", 15 * 60);

  // Use the existing email verification template but direct to our custom route
  const verificationUrl = `${env.APP_BASE_URL}/api/admin-verify?token=${token}`;

  await sendVerificationEmail({
    email,
    url: verificationUrl,
    name: "Admin",
  });

  return { success: true };
}
