import "server-only";

import { NextResponse } from "next/server";
import { apiUnhandledError } from "@/lib/api/error-contract";
import { getVerifiedSession } from "@/lib/auth/dal";
import { assertRole, type AuthPermission, assertPermission } from "@/lib/auth/policy";
import type { PlatformRole } from "@/lib/auth/dal";
import { toApiAuthError } from "@/lib/auth/error-map";

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
