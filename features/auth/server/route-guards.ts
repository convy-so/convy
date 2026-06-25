import "server-only";

import { NextResponse } from "next/server";
import { apiUnhandledError } from "@/shared/http/api-error";
import { getVerifiedSession } from "@/features/auth/server/dal";
import { assertRole, type AuthPermission, assertPermission } from "@/features/auth/public-server";
import type { PlatformRole } from "@/features/auth/server/roles";
import { toApiAuthError } from "@/features/auth/server/error-map";

export async function withAuth<T>(handler: (session: Awaited<ReturnType<typeof getVerifiedSession>>) => Promise<T>): Promise<T | NextResponse> {
  try {
    const session = await getVerifiedSession();
    return await handler(session);
  } catch (error) {
    const mapped = toApiAuthError(error);
    if (mapped) return mapped;
    return apiUnhandledError(error, "Unhandled auth wrapper error", "withAuth");
  }
}

export async function withRole<T>(roles: PlatformRole | PlatformRole[], handler: (session: Awaited<ReturnType<typeof getVerifiedSession>>) => Promise<T>): Promise<T | NextResponse> {
  return withAuth(async (session) => {
    assertRole(session.user, roles);
    return handler(session);
  });
}

export async function withPermission<T>(permission: AuthPermission, handler: (session: Awaited<ReturnType<typeof getVerifiedSession>>) => Promise<T>): Promise<T | NextResponse> {
  return withAuth(async (session) => {
    assertPermission(session.user, permission);
    return handler(session);
  });
}
