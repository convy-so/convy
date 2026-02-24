import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { surveys, surveyCreationConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";

/**
 * Publish a survey - sets status to active, copies extracted data, and generates shareable link
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json();
    const { title, description, isVoice } = body as {
      title?: string;
      description?: string;
      isVoice?: boolean;
    };

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

    // Get extracted data from creation conversation
    const [creationConversation] = await db
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    // Cast to any since extractedData can contain more fields than what's typed
    const extractedData: Record<string, any> =
      (creationConversation?.extractedData as any) || {};

    // Generate shareable link if not already present
    const shareableLink = survey.shareableLink || nanoid(10);

    // Core fields that remain as columns
    const updateData: Record<string, any> = {
      status: "active",
      shareableLink,
      updatedAt: new Date(),
    };

    if (title) {
      updateData.title = title;
    } else if (extractedData.title) {
      updateData.title = extractedData.title;
    }

    if (extractedData.objective?.goal) {
      updateData.coreObjective = extractedData.objective.goal;
    }

    if (typeof isVoice === "boolean") {
      updateData.isVoice = isVoice;
    } else if (extractedData.isVoice !== undefined) {
      updateData.isVoice = extractedData.isVoice;
    }

    // Domain nuance and other fields go into expertState
    const expertStateFields = [
      "objective",
      "targetAudience",
      "scope",
      "successCriteria",
      "constraints",
      "hypotheses",
      "tone",
      "requiredQuestions",
      "metrics",
      "personalInfo",
      "media",
    ];

    const expertState = (survey.expertState || {}) as Record<string, any>;

    for (const field of expertStateFields) {
      if (extractedData[field] !== undefined) {
        expertState[field] = extractedData[field];
      }
    }

    updateData.expertState = expertState;

    // Also copy top-level non-expert fields if they exist in extractedData
    if (extractedData.tone) updateData.tone = extractedData.tone;
    if (extractedData.requiredQuestions)
      updateData.requiredQuestions = extractedData.requiredQuestions;
    if (extractedData.metrics) updateData.metrics = extractedData.metrics;

    // Update survey with all data
    const [updatedSurvey] = await db
      .update(surveys)
      .set(updateData)
      .where(eq(surveys.id, surveyId))
      .returning();

    // Construct the full shareable URL
    const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
    const shareUrl = `${baseUrl}/s/${shareableLink}`;

    console.log(`[Publish] Survey ${surveyId} publishing...`);
    console.log(
      `[Publish] Extracted data found:`,
      JSON.stringify(extractedData, null, 2),
    );
    console.log(`[Publish] Fields being copied:`, Object.keys(updateData));

    return NextResponse.json({
      success: true,
      survey: updatedSurvey,
      shareUrl,
      shareableLink,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
    }
    console.error("Error publishing survey:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
