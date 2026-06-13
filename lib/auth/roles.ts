
export class AuthError extends Error {
  constructor(
    public readonly code:
      | "UNAUTHENTICATED"
      | "EMAIL_NOT_VERIFIED"
      | "FORBIDDEN"
      | "INVALID_ACCOUNT_STATE"
      | "SERVICE_UNAVAILABLE",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type PlatformRole = "student" | "teacher" | "expert" | "admin";

export type RolePrincipal = { role?: string | null; emailVerified?: boolean | null };

export function getPlatformRoleOrNull(
  user: RolePrincipal | null | undefined,
): PlatformRole | null {
  if (!user) return null;
  if (
    user.role === "admin" ||
    user.role === "expert" ||
    user.role === "teacher" ||
    user.role === "student"
  ) {
    return user.role;
  }
  return null;
}

export function getPlatformRole(user: RolePrincipal | null | undefined): PlatformRole {
  return getPlatformRoleOrNull(user) ?? "student";
}

export function requirePlatformRole(
  user: RolePrincipal | null | undefined,
): PlatformRole {
  const role = getPlatformRoleOrNull(user);
  if (role) {
    return role;
  }

  throw new AuthError(
    "INVALID_ACCOUNT_STATE",
    "Your account is missing a valid role. Please sign in again or contact support.",
  );
}

export function isInvalidAccountStateError(error: unknown): error is AuthError {
  return error instanceof AuthError && error.code === "INVALID_ACCOUNT_STATE";
}

export function isAdmin(user: RolePrincipal | null | undefined): boolean {
  return Boolean(user && user.emailVerified !== false && getPlatformRoleOrNull(user) === "admin");
}

export function isExpert(user: RolePrincipal | null | undefined): boolean {
  if (!user || user.emailVerified === false) return false;
  const role = getPlatformRoleOrNull(user);
  return role === "expert" || role === "admin";
}

export function assertAdmin(user: RolePrincipal | null | undefined): void {
  if (!isAdmin(user)) throw new AuthError("FORBIDDEN", "Admin access required");
}

export function assertExpert(user: RolePrincipal | null | undefined): void {
  if (!isExpert(user)) throw new AuthError("FORBIDDEN", "Expert access required");
}
