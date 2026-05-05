import type { AuthUser } from "@/lib/auth";
import { env } from "@/lib/env";

export type PlatformRole = "user" | "expert" | "admin";

export function getPlatformRole(
  user: AuthUser | null | undefined,
): PlatformRole {
  if (!user) return "user";
  if (user.role === "admin" || user.role === "expert") {
    return user.role;
  }

  if (user.email && env.ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return "admin";
  }

  return "user";
}

export function isAdminRole(user: AuthUser | null | undefined) {
  return getPlatformRole(user) === "admin";
}

export function isExpertRole(user: AuthUser | null | undefined) {
  const role = getPlatformRole(user);
  return role === "expert" || role === "admin";
}

