import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys, analyticsChatSessions } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyPermissionContext,
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";

/**
 * GET /api/surveys/[surveyId]/analytics/chat-sessions/[sessionId]
 * Returns the full chat session including messages.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ surveyId: string; sessionId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId, sessionId } = await params;

    const [survey] = await getDb()
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [chatSession] = await getDb()
      .select({
        id: analyticsChatSessions.id,
        title: analyticsChatSessions.title,
        messages: analyticsChatSessions.messages,
        createdAt: analyticsChatSessions.createdAt,
        updatedAt: analyticsChatSessions.updatedAt,
      })
      .from(analyticsChatSessions)
      .where(
        and(
          eq(analyticsChatSessions.id, sessionId),
          eq(analyticsChatSessions.surveyId, surveyId),
          eq(analyticsChatSessions.userId, session.user.id),
        ),
      );

    if (!chatSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: chatSession });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error(
      `[Chat Session ${params?.toString() || ""} GET] Error:`,
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
