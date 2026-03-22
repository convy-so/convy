import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveys, surveyCreationConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";

/**
 * Finalize survey creation - copies extracted data to survey fields and updates status
 * This endpoint is called when user clicks "Go to Sample Conversations"
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

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

    if (survey.status !== "creating") {
      return NextResponse.json(
        {
          error: "Survey has already been finalized",
          survey,
        },
        { status: 400 },
      );
    }

    // Get extracted data from creation conversation
    const [creationConversation] = await getDb()
      .select()
      .from(surveyCreationConversations)
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    if (!creationConversation) {
      return NextResponse.json(
        {
          error: "No creation conversation found",
        },
        { status: 404 },
      );
    }

    // Cast to any since extractedData can contain more fields than what's typed
    const extractedData: Record<string, any> =
      (creationConversation.extractedData as any) || {};

    console.log(
      `[Finalize Creation] Survey ${surveyId} - Transferring data...`,
    );
    console.log(
      `[Finalize Creation] Extracted data:`,
      JSON.stringify(extractedData, null, 2),
    );

    // Build update object with extracted data
    const updateData: Record<string, any> = {
      status: "sample_review",
      updatedAt: new Date(),
    };

    // Copy title from extracted data if available safely
    if (typeof extractedData.title === "string" && extractedData.title.trim() !== "") {
      updateData.title = extractedData.title.trim();
    } else if (extractedData.objective && typeof extractedData.objective.goal === "string") {
      const goal = extractedData.objective.goal.trim();
      updateData.title = goal.length > 60 ? goal.substring(0, 57) + "..." : goal;
      updateData.coreObjective = goal;
    }

    if (extractedData.domainId !== undefined && extractedData.domainId !== null) {
      const parsedDomainId = Number(extractedData.domainId);
      if (!isNaN(parsedDomainId)) {
        updateData.domainId = parsedDomainId;
      }
    }

    if (extractedData.isVoice !== undefined && extractedData.isVoice !== null) {
      updateData.isVoice = Boolean(extractedData.isVoice);
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
      if (
        extractedData[field] !== undefined &&
        extractedData[field] !== null &&
        typeof extractedData[field] !== "boolean"
      ) {
        expertState[field] = extractedData[field];
      }
    }

    updateData.expertState = expertState;

    // Also copy top-level non-expert fields if they exist in extractedData
    if (typeof extractedData.tone === "string") {
      const toneLower = extractedData.tone.toLowerCase();
      if (["formal", "casual", "playful", "empathetic"].includes(toneLower)) {
        updateData.tone = toneLower;
      }
    }

    if (Array.isArray(extractedData.requiredQuestions)) {
      updateData.requiredQuestions = extractedData.requiredQuestions.filter(
        (q: any) => typeof q === "string"
      );
    } else if (typeof extractedData.requiredQuestions === "string") {
      updateData.requiredQuestions = [extractedData.requiredQuestions];
    }

    if (Array.isArray(extractedData.metrics)) {
      updateData.metrics = extractedData.metrics.filter(
        (m: any) => typeof m === "string"
      );
    } else if (typeof extractedData.metrics === "string") {
      updateData.metrics = [extractedData.metrics];
    }

    if (Array.isArray(extractedData.personalInfo)) {
      updateData.personalInfo = extractedData.personalInfo.filter(
        (p: any) => typeof p === "string"
      );
    } else if (typeof extractedData.personalInfo === "string") {
      updateData.personalInfo = [extractedData.personalInfo];
    }

    // Update survey with all extracted data
    const [updatedSurvey] = await getDb()
      .update(surveys)
      .set(updateData)
      .where(eq(surveys.id, surveyId))
      .returning();

    // Mark creation conversation as completed
    await getDb()
      .update(surveyCreationConversations)
      .set({
        status: "completed",
        updatedAt: new Date(),
      })
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    // Trigger pattern extraction for self-improvement
    try {
      const { enqueuePatternExtraction } = await import("@/lib/queue");
      await enqueuePatternExtraction({
        conversationId: creationConversation.id,
        surveyId,
        conversationType: "creation",
        domainId: updatedSurvey.domainId ?? null,
      });
      console.log(
        `[Finalize Creation] Enqueued pattern extraction for creation conversation ${creationConversation.id}`,
      );
    } catch (error) {
      console.error(
        `[Finalize Creation] Pattern extraction enqueue failed:`,
        error,
      );
      // Don't fail the finalization if pattern extraction fails
    }

    console.log(
      `[Finalize Creation] ✅ Survey ${surveyId} finalized successfully`,
    );
    console.log(`[Finalize Creation] Updated fields:`, Object.keys(updateData));

    return NextResponse.json({
      success: true,
      survey: updatedSurvey,
      fieldsUpdated: Object.keys(updateData),
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
    console.error("[Finalize Creation] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
