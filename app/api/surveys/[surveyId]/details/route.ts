import { eq, count, and, desc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

/**
 * GET - Get detailed survey info for the owner
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    // Get survey
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
    const access = await getSurveyAccessLevel(session.user.id, survey.id);
    if (access === "none") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get response statistics
    const [stats] = await db
      .select({
        totalResponses: count(surveyConversations.id),
        completedResponses: count(surveyConversations.completed),
      })
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId));

    // Get completed count separately
    const [completedStats] = await db
      .select({
        count: count(surveyConversations.id),
      })
      .from(surveyConversations)
      .where(
        and(
          eq(surveyConversations.surveyId, surveyId),
          eq(surveyConversations.completed, true),
        ),
      );

    // Get recent responses
    const recentResponses = await db
      .select({
        id: surveyConversations.id,
        participantId: surveyConversations.participantId,
        completed: surveyConversations.completed,
        createdAt: surveyConversations.createdAt,
        updatedAt: surveyConversations.updatedAt,
      })
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId))
      .orderBy(desc(surveyConversations.createdAt))
      .limit(10);

    // Calculate completion rate
    const totalResponses = stats?.totalResponses || 0;
    const completedResponses = completedStats?.count || 0;
    const completionRate =
      totalResponses > 0
        ? Math.round((completedResponses / totalResponses) * 100)
        : 0;

    // Calculate average duration using the stored durationMs column
    const [durationStats] = await db
      .select({
        avgDuration: sql<number>`avg(${surveyConversations.durationMs})`,
      })
      .from(surveyConversations)
      .where(
        and(
          eq(surveyConversations.surveyId, surveyId),
          eq(surveyConversations.completed, true),
          sql`${surveyConversations.durationMs} > 0`,
        ),
      );

    const avgDurationMs = Math.round(Number(durationStats?.avgDuration) || 0);

    // Format duration display
    let avgDurationDisplay = "0 min";
    if (avgDurationMs > 0) {
      if (avgDurationMs < 60000) {
        const seconds = Math.round(avgDurationMs / 1000);
        avgDurationDisplay = `${seconds}s`; // e.g. "45s"
      } else {
        const minutes = Math.round(avgDurationMs / 60000);
        avgDurationDisplay = minutes === 0 ? "< 1 min" : `${minutes} min`;
      }
    }

    // Build shareable URL
    const shareableUrl = survey.shareableLink
      ? `${env.APP_BASE_URL}/s/${survey.shareableLink}`
      : null;

    return NextResponse.json({
      survey: {
        id: survey.id,
        title: survey.title,
        status: survey.status,
        createdAt: survey.createdAt,
        updatedAt: survey.updatedAt,
        expertState: survey.expertState,
        coreObjective: survey.coreObjective,
        tone: survey.tone,
        shareableLink: survey.shareableLink,
        shareableUrl,
        participantLimit: survey.participantLimit,
        currentParticipants: survey.currentParticipants,
        requiredQuestions: survey.requiredQuestions,
        metrics: survey.metrics,
        language: survey.language,
        isVoice: survey.isVoice, // ADD: Include voice capability flag
        media: survey.media, // ADD: Include media for display in sample conversations
        sampleConversationCount: survey.sampleConversationCount, // ADD: Include sample count
        userId: survey.userId,
        collaborators: survey.collaborators || [],
      },
      stats: {
        totalResponses,
        completedResponses,
        completionRate,
        avgDuration: avgDurationDisplay,
      },
      recentResponses: recentResponses.map((r) => ({
        id: r.id,
        participantId: r.participantId,
        completed: r.completed,
        completedAt: r.completed ? r.updatedAt?.toISOString() : null,
        createdAt: r.createdAt?.toISOString(),
      })),
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
    console.error("Error fetching survey details:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
