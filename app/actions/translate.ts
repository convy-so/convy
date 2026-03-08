"use server";

import { translateUIString, SupportedLanguage } from "@/lib/i18n/ai-translator";
import { auth } from "@/lib/auth";
import { headers, cookies } from "next/headers";
// import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * Server Action to translate a string for client-side components
 */
export async function getClientTranslation(text: string, context?: string) {
  try {
    const cookieStore = await cookies();
    const targetLanguage =
      (cookieStore.get("NEXT_LOCALE")?.value as SupportedLanguage) || "en";

    if (!targetLanguage || targetLanguage === "en") return text;

    return await translateUIString(text, targetLanguage, context);
  } catch (error) {
    console.error("[getClientTranslation] Error:", error);
    return text;
  }
}

/**
 * Server Action to update the user's preferred language
 */
export async function updateUserLanguage(language: SupportedLanguage) {
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
      .set({ preferredLanguage: language })
      .where(eq(users.id, session.user.id));

    // Sync cookie with Next-intl
    const cookieStore = await cookies();
    cookieStore.set("NEXT_LOCALE", language, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    console.error("[updateUserLanguage] Error:", error);
    return { success: false, error: "Failed to update language" };
  }
}
