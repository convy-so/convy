import type { AuthUser } from "@/lib/auth";
import { env } from "@/lib/env";

export type PlatformRole = "student" | "teacher" | "expert" | "admin";

export function getPlatformRole(user: AuthUser | null | undefined): PlatformRole {
  if (!user) return "student";
  if (
    user.role === "admin" ||
    user.role === "expert" ||
    user.role === "teacher" ||
    user.role === "student"
  ) {
    return user.role;
  }

  if (user.email && env.ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return "admin";
  }

  return "student";
}

export function isAdminRole(user: AuthUser | null | undefined) {
  return getPlatformRole(user) === "admin";
}

export function isExpertRole(user: AuthUser | null | undefined) {
  const role = getPlatformRole(user);
  return role === "expert" || role === "admin";
}

