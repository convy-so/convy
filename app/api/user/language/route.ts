import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [user] = await db
      .select({ preferredLanguage: users.preferredLanguage })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    return NextResponse.json({
      preferredLanguage: user?.preferredLanguage || "en",
    });
  } catch (error) {
    console.error("[User Language API] Error fetching language:", error);
    return NextResponse.json(
      { error: "Failed to fetch language" },
      { status: 500 }
    );
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { language } = body;

    if (!language || !["en", "fr", "de", "es", "it"].includes(language)) {
      return NextResponse.json(
        { error: "Invalid language" },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({ preferredLanguage: language })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true, preferredLanguage: language });
  } catch (error) {
    console.error("[User Language API] Error updating language:", error);
    return NextResponse.json(
      { error: "Failed to update language" },
      { status: 500 }
    );
  }
}
