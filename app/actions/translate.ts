"use server";

import { getCurrentSession, requireVerifiedSession } from "@/features/auth/public-server";
import { getDb } from "@/shared/db";
import { users } from "@/shared/db/schema/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { normalizeAppLocale, type AppLocale } from "@/shared/i18n/config";
import { withErrorHandling, ActionResult, UnauthorizedError } from "@/shared/http/action-result";

/**
 * Server Action to update the user's preferred language
 */
export async function updateUserLanguage(language: AppLocale): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession();

    if (!session?.user) {
      throw new UnauthorizedError();
    }

    const db = getDb();
    await db
      .update(users)
      .set({ preferredLanguage: language, uiLocale: language })
      .where(eq(users.id, session.user.id));

    revalidatePath("/", "layout");

    (await cookies()).set("NEXT_LOCALE", language, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return { success: true, data: undefined };
  }, "updateUserLanguage");
}

export async function getCurrentUiLocale() {
  const session = await getCurrentSession();
  return normalizeAppLocale(session?.user.uiLocale ?? session?.user.preferredLanguage);
}

