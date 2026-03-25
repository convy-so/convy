import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys, analyticsChatSessions } from "@/db/schema";
import type { ChatSessionMessage } from "@/db/schema/surveys";
import { getVerifiedSession } from "@/lib/auth/session";
import { getSurveyPermissionContext } from "@/lib/workspace-access";

interface PostBody {
  sessionId?: string;
  title?: string;
  messages: ChatSessionMessage[];
}

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

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const permission = await getSurveyPermissionContext(session.user.id, survey.id, {
      activeWorkspaceId: session.session.activeOrganizationId ?? null,
    });
    if (!permission?.canView || !permission.activeContextMatchesResource) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

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
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[Chat Sessions GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
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
    const body = (await request.json()) as PostBody;
    const { sessionId, title, messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    const [survey] = await getDb()
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const permission = await getSurveyPermissionContext(session.user.id, survey.id, {
      activeWorkspaceId: session.session.activeOrganizationId ?? null,
    });
    if (!permission?.canView || !permission.activeContextMatchesResource) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

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

      if (!existing) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 },
        );
      }

      const [updated] = await getDb()
        .update(analyticsChatSessions)
        .set({ messages, title: derivedTitle })
        .where(eq(analyticsChatSessions.id, sessionId))
        .returning({
          id: analyticsChatSessions.id,
          title: analyticsChatSessions.title,
        });

      resultSession = updated;
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

      resultSession = created;
    }

    return NextResponse.json({ session: resultSession });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[Chat Sessions POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
