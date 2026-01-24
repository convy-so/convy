import { eq, count, and, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";

/**
 * GET - Get detailed survey info for the owner
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ surveyId: string }> }
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

        if (survey.userId !== session.user.id) {
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
                    eq(surveyConversations.completed, true)
                )
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
        const completionRate = totalResponses > 0 
            ? Math.round((completedResponses / totalResponses) * 100) 
            : 0;

        // Build shareable URL
        const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
        const shareableUrl = survey.shareableLink 
            ? `${baseUrl}/s/${survey.shareableLink}` 
            : null;

        return NextResponse.json({
            survey: {
                id: survey.id,
                title: survey.title,
                status: survey.status,
                createdAt: survey.createdAt,
                updatedAt: survey.updatedAt,
                objective: survey.objective,
                targetAudience: survey.targetAudience,
                tone: survey.tone,
                additionalContext: survey.additionalContext,
                shareableLink: survey.shareableLink,
                shareableUrl,
                participantLimit: survey.participantLimit,
                currentParticipants: survey.currentParticipants,
                scope: survey.scope,
                requiredQuestions: survey.requiredQuestions,
                metrics: survey.metrics,
            },
            stats: {
                totalResponses,
                completedResponses,
                completionRate,
                avgDuration: "~3 min", // TODO: Calculate from actual data
            },
            recentResponses: recentResponses.map(r => ({
                id: r.id,
                participantId: r.participantId,
                completed: r.completed,
                completedAt: r.completed ? r.updatedAt?.toISOString() : null,
                createdAt: r.createdAt?.toISOString(),
            })),
        });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
                return NextResponse.json({ error: error.message }, { status: 401 });
            }
        }
        console.error("Error fetching survey details:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
