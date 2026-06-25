import { NextRequest, NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { mapSessionAuthError } from "@/shared/http/route-auth-error";
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { surveys, analyticsChatSessions } from "@/shared/db/schema";
import type { ChatSessionMessage } from "@/shared/db/schema/surveys";
import { getVerifiedSession } from "@/features/auth/public-server";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import { requireValue } from "@/shared/utils/collections";
import { z } from "zod";

const analyticsChatSessionRequestSchema = z.object({
  sessionId: z.string().optional(),
  title: z.string().optional(),
  messages: z.custom<ChatSessionMessage[]>((value) => Array.isArray(value)),
});

/**
 * GET /api/surveys/[surveyId]/analytics/chat-sessions
 * Returns list of chat sessions for this survey + user (metadata only).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const [survey] = await getDb()
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

    const chatSessions = await getDb()
      .select({
        id: analyticsChatSessions.id,
        title: analyticsChatSessions.title,
        createdAt: analyticsChatSessions.createdAt,
        updatedAt: analyticsChatSessions.updatedAt,
      })
      .from(analyticsChatSessions)
      .where(
        and(
          eq(analyticsChatSessions.surveyId, surveyId),
          eq(analyticsChatSessions.userId, session.user.id),
        ),
      )
      .orderBy(desc(analyticsChatSessions.updatedAt));

    return NextResponse.json({ sessions: chatSessions });
  } catch (error) {
    const authError = mapSessionAuthError(error);
    if (authError) return authError;
    return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]/analytics/chat-sessions:get");
  }
}

/**
 * POST /api/surveys/[surveyId]/analytics/chat-sessions
 * Creates or updates a chat session.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = analyticsChatSessionRequestSchema.parse(await request.json());
    const { sessionId, title, messages } = body;

    const [survey] = await getDb()
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

    // Derive title from first user message if not provided
    const derivedTitle =
      title ??
      messages.find((m) => m.role === "user")?.content?.slice(0, 60) ??
      "New Chat";

    let resultSession: { id: string; title: string };

    if (sessionId) {
      // Update existing session
      const [existing] = await getDb()
        .select({ id: analyticsChatSessions.id })
        .from(analyticsChatSessions)
        .where(
          and(
            eq(analyticsChatSessions.id, sessionId),
            eq(analyticsChatSessions.userId, session.user.id),
          ),
        );

      if (!existing) { return apiError("NOT_FOUND", "Session not found"); }

      const [updated] = await getDb()
        .update(analyticsChatSessions)
        .set({ messages, title: derivedTitle })
        .where(eq(analyticsChatSessions.id, sessionId))
        .returning({
          id: analyticsChatSessions.id,
          title: analyticsChatSessions.title,
        });

      resultSession = requireValue(
        updated,
        `Failed to update analytics chat session ${sessionId}`,
      );
    } else {
      // Create new session
      const newId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const [created] = await getDb()
        .insert(analyticsChatSessions)
        .values({
          id: newId,
          surveyId,
          userId: session.user.id,
          title: derivedTitle,
          messages,
        })
        .returning({
          id: analyticsChatSessions.id,
          title: analyticsChatSessions.title,
        });

      resultSession = requireValue(
        created,
        `Failed to create analytics chat session for survey ${surveyId}`,
      );
    }

    return NextResponse.json({ session: resultSession });
  } catch (error) {
    const authError = mapSessionAuthError(error);
    if (authError) return authError;
    return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]/analytics/chat-sessions:post");
  }
}

