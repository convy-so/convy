import {
  AuthError,
  getPlatformRoleOrNull,
  requirePlatformRole,
  type PlatformRole,
} from "./roles";

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

export function hasRole(
  user: AuthorizablePrincipal | null | undefined,
  roles: PlatformRole | PlatformRole[],
): boolean {
  const allowed = Array.isArray(roles) ? roles : [roles];
  const role = getPlatformRoleOrNull(user);
  return role ? allowed.includes(role) : false;
}

export function hasPermission(
  user: AuthorizablePrincipal | null | undefined,
  permission: AuthPermission,
): boolean {
  if (!user || user.emailVerified === false) return false;
  const role = getPlatformRoleOrNull(user);
  return role ? ROLE_PERMISSIONS[role].has(permission) : false;
}

export function assertRole(
  user: AuthorizablePrincipal | null | undefined,
  roles: PlatformRole | PlatformRole[],
): void {
  const allowed = Array.isArray(roles) ? roles : [roles];
  const role = requirePlatformRole(user);
  if (!allowed.includes(role)) throw new AuthError("FORBIDDEN", "Insufficient role");
}

export function assertPermission(
  user: AuthorizablePrincipal | null | undefined,
  permission: AuthPermission,
): void {
  const role = requirePlatformRole(user);
  if (!ROLE_PERMISSIONS[role].has(permission)) {
    throw new AuthError("FORBIDDEN", `Missing permission: ${permission}`);
  }
}
