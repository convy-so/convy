import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { surveys, surveyCreationConversations, surveyConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";

/**
 * DELETE - Delete a survey
 */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ surveyId: string }> }
) {
    try {
        const session = await getVerifiedSession();
        const { surveyId } = await params;

        // Get survey to verify ownership
        const [survey] = await db
            .select()
            .from(surveys)
            .where(eq(surveys.id, surveyId));

        if (!survey) {
            return NextResponse.json({ error: "Survey not found" }, { status: 404 });
        }

        if (survey.userId !== session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Delete survey (cascades to related records)
        await db.delete(surveys).where(eq(surveys.id, surveyId));

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
                return NextResponse.json({ error: error.message }, { status: 401 });
            }
        }
        console.error("Error deleting survey:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
