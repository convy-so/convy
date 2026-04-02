"use server";

import { getCurrentSession } from "@/lib/auth/session";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { normalizeAppLocale, type AppLocale } from "@/lib/i18n/config";

/**
 * Server Action to update the user's preferred language
 */
export async function updateUserLanguage(language: AppLocale) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Unauthorized" };
    }

    const db = getDb();
    await db
      .update(users)
      .set({ preferredLanguage: language, uiLocale: language })
      .where(eq(users.id, session.user.id));

    revalidatePath("/", "layout");

    // Sync the NEXT_LOCALE cookie so the proxy can perform optimistic redirects
    (await cookies()).set("NEXT_LOCALE", language, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return { success: true };
  } catch (error) {
    console.error("[updateUserLanguage] Error:", error);
    return { success: false, error: "Failed to update language" };
  }
}

export async function getCurrentUiLocale() {
  const session = await getCurrentSession();
  return normalizeAppLocale(session?.user.uiLocale ?? session?.user.preferredLanguage);
}
