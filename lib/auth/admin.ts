import { AuthUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";

/**
 * Checks if a user has admin privileges based on the environment configuration.
 * In a production system, this relies on the user being authenticated AND
 * having an email that matches the secret ADMIN_EMAILS list.
 */
export function isAdmin(user: AuthUser | null): boolean {
  if (!user) return false;
  const isVerified = user.emailVerified !== false;
  return isVerified && isAdminRole(user);
}

/**
 * Higher-order check for use in server components/actions
 */
export async function assertAdmin(user: AuthUser | null) {
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin access required");
  }
}
