import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { surveys } from "@/db/schema";
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
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    // 1. Verify survey ownership
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

    // 2. Prepare Agent Context
    const surveyConfig = buildCompleteSurveyConfig(survey);
    const agentContext: AgentContext = {
      conversationId: `creator-chat-${surveyId}-${session.user.id}`,
      messages: messages,
      surveyConfig,
      language: (survey.language as "en" | "fr" | "de" | "es" | "it") || "en",
    };

    // 3. Initialize Orchestrator and get Analytics Specialist
    const orchestrator = new AgentOrchestrator(agentContext);
    const analyticsSpecialist = orchestrator.getAnalyticsSpecialist();

    // 4. Stream response
    const result = analyticsSpecialist.stream(messages as any);

    return result.toUIMessageStreamResponse();
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
