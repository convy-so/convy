import { NextResponse } from "next/server";
import { apiUnhandledError } from "@/lib/api/error-contract";
import { surveyErrors } from "@/lib/surveys/errors";

import { getVerifiedSession } from "@/lib/auth/dal";
import { scheduleAnalyticsRefresh } from "@/lib/analytics-scheduler";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";
import { getSurveyAnalyticsViewModel } from "@/lib/surveys/use-cases/get-survey-analytics";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { searchParams } = new URL(request.url);

    return getSurveyAnalyticsViewModel({
      surveyId,
      session,
      language: searchParams.get("language"),
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to fetch analytics", "/api/surveys/[surveyId]/analytics:get");
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return surveyErrors.unauthorized("Unauthorized. Only owners and editors can trigger analytics.");
    }

    await scheduleAnalyticsRefresh({
      surveyId,
      userId: session.user.id,
      force: true,
    });

    return NextResponse.json({
      status: "queued",
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to trigger analytics generation", "/api/surveys/[surveyId]/analytics:post");
  }
}
