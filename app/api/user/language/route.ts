import { NextRequest, NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { normalizeAppLocale, isAppLocale } from "@/lib/i18n/config";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * GET /api/user/language
 * Fetch the current user's preferred language
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return apiError("UNAUTHENTICATED", "Unauthorized");
    }

    const [user] = await getDb()
      .select({ preferredLanguage: users.preferredLanguage, uiLocale: users.uiLocale })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const uiLocale = normalizeAppLocale(user?.uiLocale ?? user?.preferredLanguage);

    return NextResponse.json({
      uiLocale,
      preferredLanguage: uiLocale,
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to fetch language", "/api/user/language:get");
  }
}

/**
 * PATCH /api/user/language
 * Update the current user's preferred language
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return apiError("UNAUTHENTICATED", "Unauthorized");
    }

    const body = await request.json();
    const { language } = body;

    if (!isAppLocale(language)) {
      return apiError("VALIDATION_ERROR", "Invalid language");
    }

    await getDb()
      .update(users)
      .set({ preferredLanguage: language, uiLocale: language })
      .where(eq(users.id, session.user.id));

    (await cookies()).set("NEXT_LOCALE", language, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    });

    return NextResponse.json({
      success: true,
      uiLocale: language,
      preferredLanguage: language,
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to update language", "/api/user/language:patch");
  }
}


