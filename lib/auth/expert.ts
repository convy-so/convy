import type { AuthUser } from "@/lib/auth";
import { canAccessAiOps, isExpertRole } from "@/lib/auth/roles";

export function isExpert(user: AuthUser | null) {
  if (!user) return false;
  const isVerified = user.emailVerified !== false;
  return isVerified && isExpertRole(user);
}

export function hasAiOpsAccess(user: AuthUser | null) {
  if (!user) return false;
  const isVerified = user.emailVerified !== false;
  return isVerified && canAccessAiOps(user);
}

export async function assertAiOpsUser(user: AuthUser | null) {
  if (!hasAiOpsAccess(user)) {
    throw new Error("Unauthorized: Expert or admin access required");
  }
}
