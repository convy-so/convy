import { NextResponse } from "next/server";

import { getVerifiedSession } from "@/features/auth/public-server";
import {
  getActiveSurveyLease,
  getCurrentSurveyRevision,
} from "@/features/surveys/server/collaboration-service";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { parseSampleRouteBody, submitSampleTurn } from "@/features/surveys/server/use-cases/submit-sample-turn";
import { getSampleConversationStateViewModel } from "@/features/surveys/server/use-cases/get-sample-conversation-state";

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
    const sampleState = await getSampleConversationStateViewModel(
      surveyId,
      conversationNumber,
      session,
    );

    return NextResponse.json({
      ...sampleState,
      lease: await getActiveSurveyLease(surveyId, "rehearsal"),
      revision: await getCurrentSurveyRevision(surveyId),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Survey not found") {
        return apiError("NOT_FOUND", error.message);
      }
      if (error.message === "Unauthorized") {
        return apiError("UNAUTHORIZED", error.message);
      }
    }
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
