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

export function isAdmin(user: AuthUser | null | undefined): boolean {
  if (!user || user.emailVerified === false) return false;
  return getPlatformRole(user) === "admin";
}

export function isExpert(user: AuthUser | null | undefined): boolean {
  if (!user || user.emailVerified === false) return false;
  const role = getPlatformRole(user);
  return role === "expert" || role === "admin";
}

export async function assertAdmin(user: AuthUser | null | undefined) {
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin access required");
  }
}

export async function assertExpert(user: AuthUser | null | undefined) {
  if (!isExpert(user)) {
    throw new Error("Unauthorized: Expert access required");
  }
}

