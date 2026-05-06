import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";
import {
  getResearchBrief,
  getActiveCoveragePlan,
  getActiveConductingProfile,
  replaceConductingProfile,
} from "@/lib/education/storage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const body = await request.json().catch(() => ({}));

    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }
    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canPublish")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

    const [briefRow, planRow] = await Promise.all([
      getResearchBrief(surveyId),
      getActiveCoveragePlan(surveyId),
    ]);
    if (!briefRow || !planRow) { return apiError("VALIDATION_ERROR", "The education brief is not ready yet."); }
    if (briefRow.missingFields.length > 0) { return apiError("VALIDATION_ERROR", "The brief is incomplete.", { details: { missingFields: briefRow.missingFields } }); }

    const activeSampleProfile = await getActiveConductingProfile(surveyId, "sample");
    if (activeSampleProfile?.profile) {
      await replaceConductingProfile({
        surveyId,
        mode: "live",
        sourcePatchId: activeSampleProfile.sourcePatchId,
        profile: {
          ...activeSampleProfile.profile,
          mode: "live",
          version: activeSampleProfile.profile.version,
          createdAt: new Date().toISOString(),
        },
      });
    }

    const shareableLink = survey.shareableLink || nanoid(10);
    const [updatedSurvey] = await getDb()
      .update(surveys)
      .set({
        status: "active",
        shareableLink,
        title:
          typeof body.title === "string" && body.title.trim()
            ? body.title.trim()
            : briefRow.brief.title,
        description:
          typeof body.description === "string"
            ? body.description
            : briefRow.brief.learningContext,
        coreObjective: briefRow.brief.researchGoal,
        programId: briefRow.programId,
        isVoice:
          typeof body.isVoice === "boolean" ? body.isVoice : survey.isVoice,
        updatedAt: new Date(),
      })
      .where(eq(surveys.id, surveyId))
      .returning();

    return NextResponse.json({
      success: true,
      survey: updatedSurvey,
      brief: briefRow.brief,
      coveragePlan: planRow.plan,
      shareableLink,
      shareUrl: `${env.APP_BASE_URL}/s/${shareableLink}`,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) { return apiError("UNAUTHENTICATED", error.message); } return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]/publish:post");
  }
}

