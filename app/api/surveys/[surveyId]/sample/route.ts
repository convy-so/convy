import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import {
  getActiveSurveyLease,
  getCurrentSurveyRevision,
} from "@/lib/collaboration-service";
import {
  toPersistedUIChatMessages,
  toVisibleConversationMessages,
} from "@/lib/chat-ui-messages";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { parseSampleRouteBody, submitSampleTurn } from "@/lib/surveys/use-cases/submit-sample-turn";

export const maxDuration = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { searchParams } = new URL(request.url);
    const conversationNumber = Number(searchParams.get("conversationNumber") || 1);

    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) return apiError("NOT_FOUND", "Survey not found");

    const permission = await getSurveyPermissionForSession(session, survey.id);
    if (!hasSurveyPermission(permission, "canView")) return apiError("UNAUTHORIZED", "Unauthorized");

    const [sample] = await getDb().select().from(sampleConversations).where(
      and(
        eq(sampleConversations.surveyId, surveyId),
        eq(sampleConversations.conversationNumber, conversationNumber),
      ),
    ).limit(1);

    return NextResponse.json({
      messages: toVisibleConversationMessages(
        toPersistedUIChatMessages(sample?.messages ?? [], ["user", "assistant"]),
      ),
      lease: await getActiveSurveyLease(surveyId, "rehearsal"),
      revision: await getCurrentSurveyRevision(surveyId),
    });
  } catch (error) {
    return apiUnhandledError(error, "Internal server error", "survey-sample:get");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = parseSampleRouteBody(await request.json());
    return submitSampleTurn({ surveyId, session, body });
  } catch (error) {
    return apiUnhandledError(error, "Internal server error", "survey-sample:post");
  }
}
