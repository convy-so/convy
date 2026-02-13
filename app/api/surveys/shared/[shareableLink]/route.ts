import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { surveys } from "@/db/schema";

/**
 * Get a survey by its shareable link (public endpoint)
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ shareableLink: string }> }
) {
    try {
        const { shareableLink } = await params;

        const [survey] = await db
            .select({
                id: surveys.id,
                title: surveys.title,
                objective: surveys.objective,
                targetAudience: surveys.targetAudience,
                status: surveys.status,
                currentParticipants: surveys.currentParticipants,
                participantLimit: surveys.participantLimit,
            })
            .from(surveys)
            .where(eq(surveys.shareableLink, shareableLink));

        if (!survey) {
            return NextResponse.json({ error: "Survey not found" }, { status: 404 });
        }

        if (survey.status !== "active") {
            return NextResponse.json({ error: "Survey is not active" }, { status: 403 });
        }

        return NextResponse.json({ survey });
    } catch (error) {
        console.error("Error fetching shared survey:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
