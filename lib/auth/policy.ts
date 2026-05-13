import { AuthError, getPlatformRole, type PlatformRole } from "./roles";

export type AuthorizablePrincipal = {
  role?: string | null;
  emailVerified?: boolean | null;
};

export type AuthPermission =
  | "auth:read"
  | "admin:manage"
  | "expert:manage"
  | "survey:view"
  | "survey:edit";

const ROLE_PERMISSIONS: Record<PlatformRole, Set<AuthPermission>> = {
  student: new Set(["auth:read", "survey:view"]),
  teacher: new Set(["auth:read", "survey:view", "survey:edit"]),
  expert: new Set(["auth:read", "expert:manage", "survey:view", "survey:edit"]),
  admin: new Set(["auth:read", "admin:manage", "expert:manage", "survey:view", "survey:edit"]),
};

export function hasRole(user: AuthorizablePrincipal | null | undefined, roles: PlatformRole | PlatformRole[]): boolean {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return allowed.includes(getPlatformRole(user));
}

export function hasPermission(user: AuthorizablePrincipal | null | undefined, permission: AuthPermission): boolean {
  if (!user || user.emailVerified === false) return false;
  return ROLE_PERMISSIONS[getPlatformRole(user)].has(permission);
}

export function assertRole(user: AuthorizablePrincipal | null | undefined, roles: PlatformRole | PlatformRole[]): void {
  if (!hasRole(user, roles)) throw new AuthError("FORBIDDEN", "Insufficient role");
}

export function assertPermission(user: AuthorizablePrincipal | null | undefined, permission: AuthPermission): void {
  if (!hasPermission(user, permission)) throw new AuthError("FORBIDDEN", `Missing permission: ${permission}`);
}
