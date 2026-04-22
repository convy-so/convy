import { eq, count, and, desc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveyBriefs, surveys, surveyConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";

/**
 * GET - Get detailed survey info for the owner
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const [survey, briefRow] = await Promise.all([
      getDb().query.surveys.findFirst({
        where: eq(surveys.id, surveyId),
        with: {
          classroom: {
            columns: {
              title: true,
            },
          },
        },
      }),
      getDb().select().from(surveyBriefs).where(eq(surveyBriefs.surveyId, surveyId)).then((rows) => rows[0]),
    ]);

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get response statistics (only count if they have at least one user message)
    const [stats] = await getDb()
      .select({
        totalResponses: count(surveyConversations.id),
      })
      .from(surveyConversations)
      .where(
        and(
          eq(surveyConversations.surveyId, surveyId),
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${surveyConversations.rawConversation}) as msg 
            WHERE msg->>'role' = 'user'
          )`,
        ),
      );

    // Get completed count separately
    const [completedStats] = await getDb()
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
    const recentResponses = await getDb()
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
    const [durationStats] = await getDb()
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
        description: survey.description,
        createdAt: survey.createdAt,
        updatedAt: survey.updatedAt,
        coreObjective: survey.coreObjective,
        programId: survey.programId,
        brief: briefRow?.brief || null,
        tone: survey.tone,
        shareableLink: survey.shareableLink,
        shareableUrl,
        participantLimit: survey.participantLimit,
        currentParticipants: survey.currentParticipants,
        requiredQuestions: survey.requiredQuestions,
        metrics: survey.metrics,
        language: survey.language,
        isVoice: survey.isVoice,
        media: survey.media,
        sampleConversationCount: survey.sampleConversationCount,
        userId: survey.userId,
        deliveryMode: survey.deliveryMode,
        classroomId: survey.classroomId,
        classroomTitle: survey.classroom?.title ?? null,
        editors: [],
        permission,
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
