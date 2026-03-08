import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  surveys,
  surveyConversations,
  conversationInsights,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";

/**
 * GET /api/surveys/[surveyId]/responses/[responseId]
 *
 * Returns detailed information for a specific response (conversation),
 * including the transcript, duration, status, and AI-generated insights.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string; responseId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId, responseId } = await params;

    const [survey] = await getDb()
      .select({
        id: surveys.id,
        title: surveys.title,
        userId: surveys.userId,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    if (survey.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 2. Fetch the conversation (response)
    // We check both ID and SurveyID to ensure integrity
    const [conversation] = await getDb()
      .select()
      .from(surveyConversations)
      .where(
        and(
          eq(surveyConversations.id, responseId),
          eq(surveyConversations.surveyId, surveyId),
        ),
      );

    if (!conversation) {
      return NextResponse.json(
        { error: "Response not found" },
        { status: 404 },
      );
    }

    // 3. Fetch insights if they exist
    const [insights] = await getDb()
      .select()
      .from(conversationInsights)
      .where(eq(conversationInsights.conversationId, responseId));

    // 4. Transform data for frontend
    const insightsData = (insights?.insights as Record<string, unknown>) || {};

    // Calculate duration from raw conversation if not in insights
    let duration = insightsData.durationMinutes
      ? `${Math.round(insightsData.durationMinutes as number)} min`
      : "N/A";

    // If we have raw conversation timestamps, we can be more precise if insights are missing
    if (
      duration === "N/A" &&
      Array.isArray(conversation.rawConversation) &&
      conversation.rawConversation.length > 0
    ) {
      const firstMsg = conversation.rawConversation[0] as {
        timestamp?: string;
      };
      const lastMsg = conversation.rawConversation[
        conversation.rawConversation.length - 1
      ] as { timestamp?: string };
      if (firstMsg?.timestamp && lastMsg?.timestamp) {
        // Timestamps are usually "HH:MM:SS" string in current implementation
        // Rough calculation or just keep it simple if it's display only
        duration = "unknown";
      }
    }

    const response = {
      id: conversation.id,
      surveyId: survey.id,
      surveyTitle: survey.title,
      participantId: conversation.participantId || "Anonymous",
      startedAt: conversation.createdAt.toISOString(),
      completedAt: conversation.completed
        ? conversation.updatedAt.toISOString()
        : null, // Approx
      duration: insightsData.durationMinutes
        ? `${Math.floor(insightsData.durationMinutes)}m ${Math.round((insightsData.durationMinutes % 1) * 60)}s`
        : "In Progress",
      status: conversation.completed ? "completed" : "in_progress",

      // Insights Data (fallbacks if missing)
      sentiment: insightsData.sentiment?.overall || null,
      sentimentScore: insightsData.sentiment?.score || 0,
      keyInsights: insights?.keyFindings?.split("\n\n") || [],
      summary:
        conversation.summary ||
        insightsData.summary ||
        "No summary available yet.",

      // Conversation Transcript
      conversation: conversation.rawConversation || [],
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
    }
    console.error("[Response Details API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch response details" },
      { status: 500 },
    );
  }
}
