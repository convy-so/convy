import { NextRequest, NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { mapSessionAuthError } from "@/lib/route-auth-error";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys, analyticsChatSessions } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";

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

    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

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

    if (!chatSession) { return apiError("NOT_FOUND", "Session not found"); }

    return NextResponse.json({ session: chatSession });
  } catch (error) {
    const authError = mapSessionAuthError(error);
    if (authError) return authError;
    return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]/analytics/chat-sessions/[sessionId]:get");
  }
}

