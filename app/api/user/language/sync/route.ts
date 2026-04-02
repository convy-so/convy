import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { normalizeAppLocale } from "@/lib/i18n/config";

/**
 * GET /api/user/language/sync
 *
 * Safely syncs the NEXT_LOCALE cookie from a Server Context
 * This is the production-ready way to update cookies when
 * redirected from a Server Component (where cookies are read-only).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const locale = normalizeAppLocale(searchParams.get("locale"));
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const response = NextResponse.redirect(new URL(redirectTo, request.url));

  // Set the NEXT_LOCALE cookie
  // This is allowed in Route Handlers
  (await cookies()).set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
