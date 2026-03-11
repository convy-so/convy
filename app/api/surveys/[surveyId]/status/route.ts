
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ surveyId: string }> }
) {
    try {
        const session = await getVerifiedSession();
        const { surveyId } = await params;
        const body = await request.json();
        const { status } = body;

        if (!status || !['active', 'paused'].includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        // Get survey to verify ownership
        const [survey] = await getDb()
            .select()
            .from(surveys)
            .where(eq(surveys.id, surveyId));

        if (!survey) {
            return NextResponse.json({ error: "Survey not found" }, { status: 404 });
        }

        if (survey.userId !== session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Update survey status
        await getDb()
            .update(surveys)
            .set({
                status: status as "active" | "paused",
                updatedAt: new Date(),
            })
            .where(eq(surveys.id, surveyId));

        return NextResponse.json({ success: true, status });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
                return NextResponse.json({ error: error.message }, { status: 401 });
            }
        }
        console.error("Error updating survey status:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
