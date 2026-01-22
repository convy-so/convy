
import {
  getVerifiedSession,
} from "@/lib/auth/session";

import {type AuthSessionWithUser} from "@/lib/auth";

const ROLE_PRIORITY = {
  user: 0,
  admin: 1,
} as const;

export type Role = keyof typeof ROLE_PRIORITY;

export async function requireRole(role: Role): Promise<AuthSessionWithUser> {
  const session = await getVerifiedSession();
  const userRole = session.user.role;

  if (!userRole || !(userRole in ROLE_PRIORITY)) {
    throw new Error("FORBIDDEN");
  }

  if (ROLE_PRIORITY[userRole as Role] < ROLE_PRIORITY[role]) {
    throw new Error("FORBIDDEN");
  }

  return session;
}
export async function canAccess(role: Role) {
  try {
    await requireRole(role);
    return true;
  } catch {
    return false;
  }
}
