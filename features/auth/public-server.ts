import "server-only";

export { auth } from "@/features/auth/server/server-auth";
export type {
  AuthSessionWithUser,
  AuthUser,
} from "@/features/auth/server/server-auth";

export {
  AuthError,
  getCurrentSession,
  getVerifiedSession,
  requireVerifiedSession,
  requireRole,
  requireStudentUser,
  requireTeacherUser,
  requireExpertUser,
  getPlatformRole,
  getPlatformRoleOrNull,
  isInvalidAccountStateError,
  isAdmin,
  isExpert,
  assertAdmin,
  assertExpert,
  requirePlatformRole,
} from "@/features/auth/server/dal";
export type {
  PlatformRole,
  RolePrincipal,
} from "@/features/auth/server/dal";

export * from "@/features/auth/server/admin-path";
export * from "@/features/auth/server/audit";
export * from "@/features/auth/server/auth-intent";
export * from "@/features/auth/server/error-map";
export * from "@/features/auth/server/expert-invitation-access";
export * from "@/features/auth/server/expert-invitations";
export * from "@/features/auth/server/expert-profile";
export * from "@/features/auth/server/hrefs";
export * from "@/features/auth/server/invitation-access";
export * from "@/features/auth/server/policy";
export * from "@/features/auth/server/redirect";
export * from "@/features/auth/server/roles";
export * from "@/features/auth/server/viewer-access";
