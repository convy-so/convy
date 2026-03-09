import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { convertToModelMessages } from "ai";

import { getDb } from "@/db";
import { surveys, users } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import { AgentOrchestrator } from "@/lib/agents/orchestrator";
import type { AgentContext } from "@/lib/agents/types";

export const maxDuration = 300;

/**
 * POST /api/surveys/[surveyId]/analytics/chat
 *
 * Secure chat endpoint for creators to "Chat with their data".
 * Pulls context from RAG and uses AnalyticsSpecialist.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = (await request.json()) as { messages?: unknown[] };
    const rawMessages = body.messages;

    if (!rawMessages || !Array.isArray(rawMessages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    // 1. Verify survey ownership
    const [survey] = await getDb()
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

    // Fetch user preferred language
    const [user] = await getDb()
      .select({ preferredLanguage: users.preferredLanguage })
      .from(users)
      .where(eq(users.id, session.user.id));

    // 2. Convert UIMessages → ModelMessages and strip synthetic welcome message
    const uiMessages = rawMessages.filter(
      (m): m is Record<string, unknown> =>
        typeof m === "object" &&
        m !== null &&
        (m as Record<string, unknown>).id !== "welcome",
    ) as any[];

    const modelMessages = await convertToModelMessages(uiMessages);

    if (!modelMessages.length) {
      return NextResponse.json(
        { error: "No messages to process" },
        { status: 400 },
      );
    }

    // 3. Prepare Agent Context
    const surveyConfig = buildCompleteSurveyConfig(survey);
    const agentContext: AgentContext = {
      conversationId: `creator-chat-${surveyId}-${session.user.id}`,
      messages: uiMessages as AgentContext["messages"],
      surveyConfig,
      language:
        (user?.preferredLanguage as "en" | "fr" | "de" | "es" | "it") || "en",
    };

    // 4. Initialize Orchestrator and get Analytics Specialist
    const orchestrator = new AgentOrchestrator(agentContext);
    const analyticsSpecialist = orchestrator.getAnalyticsSpecialist();

    // 5. Stream response using correctly typed ModelMessages
    const result = analyticsSpecialist.stream(modelMessages);

    return result.toTextStreamResponse();
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
    }
    console.error("[Analytics Chat API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
