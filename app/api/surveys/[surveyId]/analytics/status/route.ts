import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { surveys } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getAnalyticsState } from "@/features/surveys/server/education/storage";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";

export async function GET(
  _request: Request,
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

    return NextResponse.json({
      state: (await getAnalyticsState(surveyId))?.state ?? null,
    });
  } catch (error) { return apiUnhandledError(error, "Failed to fetch analytics status", "/api/surveys/[surveyId]/analytics/status:get"); }
}

