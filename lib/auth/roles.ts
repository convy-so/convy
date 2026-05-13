
export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "EMAIL_NOT_VERIFIED" | "FORBIDDEN",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type PlatformRole = "student" | "teacher" | "expert" | "admin";

export type RolePrincipal = { role?: string | null; emailVerified?: boolean | null };

export function getPlatformRole(user: RolePrincipal | null | undefined): PlatformRole {
  if (!user) return "student";
  if (user.role === "admin" || user.role === "expert" || user.role === "teacher" || user.role === "student") {
    return user.role;
  }
  return "student";
}

export function isAdmin(user: RolePrincipal | null | undefined): boolean {
  return Boolean(user && user.emailVerified !== false && getPlatformRole(user) === "admin");
}

export function isExpert(user: RolePrincipal | null | undefined): boolean {
  if (!user || user.emailVerified === false) return false;
  const role = getPlatformRole(user);
  return role === "expert" || role === "admin";
}

export function assertAdmin(user: RolePrincipal | null | undefined): void {
  if (!isAdmin(user)) throw new AuthError("FORBIDDEN", "Admin access required");
}

export function assertExpert(user: RolePrincipal | null | undefined): void {
  if (!isExpert(user)) throw new AuthError("FORBIDDEN", "Expert access required");
}
