import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { analyticsChatSessions, surveyConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";

const SESSION_TITLE = "Automated Generative Summary";

/**
 * GET /api/surveys/[surveyId]/analytics/check-delta
 *
 * Lightweight comparison endpoint — tells the frontend whether new survey
 * responses have been collected since the last generative summary was made.
 *
 * Returns:
 *   { changed: boolean, currentCount: number, lastCount: number }
 *
 * The frontend calls this BEFORE firing a manual refresh to avoid making
 * an OpenAI API call when no new data exists.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
    const access = await getSurveyAccessLevel(session.user.id, surveyId);

    if (access === "none") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get the last-processed count from the chat session
    const [chatSession] = await getDb()
      .select({
        lastCount: analyticsChatSessions.lastProcessedResponseCount,
      })
      .from(analyticsChatSessions)
      .where(
        and(
          eq(analyticsChatSessions.surveyId, surveyId),
          eq(analyticsChatSessions.title, SESSION_TITLE),
        ),
      )
      .limit(1);

    // Get the current total response count (all conversations for this survey)
    const [{ value: currentCount }] = await getDb()
      .select({ value: count() })
      .from(surveyConversations)
      .where(eq(surveyConversations.surveyId, surveyId));

    const lastCount = chatSession?.lastCount ?? 0;

    return NextResponse.json({
      changed: lastCount !== currentCount,
      currentCount,
      lastCount,
    });
  } catch (error) {
    console.error("[check-delta] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
