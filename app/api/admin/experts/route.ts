import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
    try {
        const session = await getCurrentSession();
        if (!session || !isAdmin(session.user)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { name, email } = await req.json();

        if (!name || !email) {
            return apiError("VALIDATION_ERROR", "Name and email are required");
        }

        // Generate a random secure temporary password
        const tempPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10) + "A1!";

        // We use auth.api.signUpEmail directly to create the user, but since we have a database hook preventing
        // users from getting the expert role via sign up, we must create them as a normal user first,
        // then use auth.api.setRole to elevate them.
        const res = await auth.api.signUpEmail({
            body: {
                name,
                email,
                password: tempPassword,
            }
        });

        if (!res.user) {
            throw new Error("Failed to create user account");
        }

        // Elevate to expert
        await getDb().update(users).set({ role: "expert" }).where(eq(users.id, res.user.id));

        return NextResponse.json({ success: true, userId: res.user.id });
    } catch (error) {
        return apiUnhandledError(error, "Internal Server Error", "/api/admin/experts");
    }
}
