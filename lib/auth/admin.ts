import { env } from "@/lib/env";
import { AuthUser } from "@/lib/auth";

/**
 * Checks if a user has admin privileges based on the environment configuration.
 * In a production system, this relies on the user being authenticated AND
 * having an email that matches the secret ADMIN_EMAILS list.
 */
export function isAdmin(user: AuthUser | null): boolean {
  if (!user || !user.email) return false;

  // 1. Check if email is in the admin list
  const isEmailAdmin = env.ADMIN_EMAILS.includes(user.email.toLowerCase());

  // 2. Security Check: Only allow if email is verified (if applicable)
  // If your auth flow allows unverified accounts, we should strictly check .emailVerified
  const isVerified =
    (user as AuthUser & { emailVerified?: boolean }).emailVerified !== false;

  return isEmailAdmin && isVerified;
}

/**
 * Higher-order check for use in server components/actions
 */
export async function assertAdmin(user: AuthUser | null) {
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin access required");
  }
}
