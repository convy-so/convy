import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { mapSessionAuthError } from "@/lib/route-auth-error";

import { getDb } from "@/db";
import { surveyCreationConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { getResearchBrief, getActiveCoveragePlan } from "@/lib/education/storage";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }
    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) { return apiError("UNAUTHORIZED", "Unauthorized"); }
    if (survey.status !== "creating") { return apiError("VALIDATION_ERROR", "Survey has already been finalized", { details: { survey } }); }

    const [briefRow, planRow] = await Promise.all([
      getResearchBrief(surveyId),
      getActiveCoveragePlan(surveyId),
    ]);
    if (!briefRow || !planRow) { return apiError("VALIDATION_ERROR", "The education brief is not ready yet."); }
    if (briefRow.missingFields.length > 0) { return apiError("VALIDATION_ERROR", "The brief is incomplete.", { details: { missingFields: briefRow.missingFields } }); }

    const [updatedSurvey] = await getDb()
      .update(surveys)
      .set({
        status: "sample_review",
        title: briefRow.brief.title,
        description: briefRow.brief.learningContext,
        coreObjective: briefRow.brief.researchGoal,
        programId: briefRow.programId,
        updatedAt: new Date(),
      })
      .where(eq(surveys.id, surveyId))
      .returning();

    await getDb()
      .update(surveyCreationConversations)
      .set({
        status: "completed",
        extractedData: {
          programId: briefRow.programId,
          brief: briefRow.brief,
          coveragePlan: planRow.plan,
          readyForSampling: true,
        },
        updatedAt: new Date(),
      })
      .where(eq(surveyCreationConversations.surveyId, surveyId));

    return NextResponse.json({
      success: true,
      survey: updatedSurvey,
      brief: briefRow.brief,
      coveragePlan: planRow.plan,
    });
  } catch (error) {
    const authError = mapSessionAuthError(error); if (authError) return authError; return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]/finalize-creation:post");
  }
}

