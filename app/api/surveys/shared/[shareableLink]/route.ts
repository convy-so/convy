import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getResearchBrief } from "@/lib/education/storage";

/**
 * Get a survey by its shareable link (public endpoint)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareableLink: string }> },
) {
  try {
    const { shareableLink } = await params;

    const [survey] = await getDb()
      .select({
        id: surveys.id,
        title: surveys.title,
        programId: surveys.programId,
        coreObjective: surveys.coreObjective,
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
      return NextResponse.json(
        { error: "Survey is not active" },
        { status: 403 },
      );
    }

    const briefRow = await getResearchBrief(survey.id);

    return NextResponse.json({
      survey: {
        ...survey,
        brief: briefRow?.brief || null,
      },
    });
  } catch (error) {
    console.error("Error fetching shared survey:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
