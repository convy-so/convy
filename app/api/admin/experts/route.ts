import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/dal";
import { isAdmin } from "@/lib/auth/dal";
import { auth } from "@/lib/auth";
import { normalizeIdentityEmail } from "@/lib/auth/auth-intent";
import { provisionUserRole } from "@/lib/auth/role-provisioning";

export async function POST(req: Request) {
    try {
        const session = await getCurrentSession();
        if (!session || !isAdmin(session.user)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { name, email } = await req.json();
        const normalizedEmail = typeof email === "string" ? normalizeIdentityEmail(email) : "";

        if (!name || !normalizedEmail) {
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
                email: normalizedEmail,
                password: tempPassword,
            }
        });

        if (!res.user) {
            throw new Error("Failed to create user account");
        }

        // Elevate to expert
        await provisionUserRole({ userId: res.user.id, role: "expert" });

        return NextResponse.json({ success: true, userId: res.user.id });
    } catch (error) {
        return apiUnhandledError(error, "Internal Server Error", "/api/admin/experts");
    }
}
