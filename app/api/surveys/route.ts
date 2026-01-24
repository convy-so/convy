
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

/**
 * Get all surveys for the authenticated user
 */
export async function GET() {
    try {
        const session = await getVerifiedSession();

        // Fetch user's surveys
        const userSurveys = await db
            .select({
                id: surveys.id,
                title: surveys.title,
                additionalContext: surveys.additionalContext,
                status: surveys.status,
                shareableLink: surveys.shareableLink,
                createdAt: surveys.createdAt,
                updatedAt: surveys.updatedAt,
                currentParticipants: surveys.currentParticipants,
                participantLimit: surveys.participantLimit,
                objective: surveys.objective,
            })
            .from(surveys)
            .where(eq(surveys.userId, session.user.id))
            .orderBy(desc(surveys.createdAt));

        // Format the response
        const formattedSurveys = userSurveys.map(survey => ({
            id: survey.id,
            title: survey.title || "Untitled Survey",
            description: survey.additionalContext || (survey.objective as any)?.description || "",
            status: survey.status,
            shareableLink: survey.shareableLink,
            responses: survey.currentParticipants,
            completionRate: 0,
            createdAt: survey.createdAt?.toISOString().split('T')[0] || "",
            lastResponse: "Never",
            isOwner: true,
            isVoice: false,
        }));

        return NextResponse.json({ surveys: formattedSurveys });
    } catch (error) {
        if (error instanceof Error) {
            if (
                error.message === "UNAUTHENTICATED" ||
                error.message === "EMAIL_NOT_VERIFIED"
            ) {
                return NextResponse.json({ error: error.message }, { status: 401 });
            }
        }
        console.error("Error fetching surveys:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();

    // Create a new survey draft
    const surveyId = nanoid();
    const now = new Date();

    const [survey] = await db
      .insert(surveys)
      .values({
        id: surveyId,
        userId: session.user.id,
        title: "Untitled Survey",
        status: "creating",
        language: "en",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json(survey);
  } catch (error) {
    if (error instanceof Error) {
        if (
          error.message === "UNAUTHENTICATED" ||
          error.message === "EMAIL_NOT_VERIFIED"
        ) {
          return new NextResponse(error.message, { status: 401 });
        }
    }
    console.error("Error creating survey:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
