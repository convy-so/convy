import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import {
  recordRealtimeEvent,
} from "@/lib/collaboration-service";
import { getSurveyPermissionContext } from "@/lib/workspace-access";
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
    if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    const permission = await getSurveyPermissionContext(session.user.id, surveyId);
    if (!permission?.canPublish) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [briefRow, planRow] = await Promise.all([
      getResearchBrief(surveyId),
      getActiveCoveragePlan(surveyId),
    ]);
    if (!briefRow || !planRow) {
      return NextResponse.json({ error: "The education brief is not ready yet." }, { status: 400 });
    }
    if (briefRow.missingFields.length > 0) {
      return NextResponse.json({ error: "The brief is incomplete.", missingFields: briefRow.missingFields }, { status: 400 });
    }

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
    let updatedSurvey: typeof surveys.$inferSelect | undefined;
    await getDb().transaction(async (tx) => {
      [updatedSurvey] = await tx
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

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.published",
        actorId: session.user.id,
        payload: {
          surveyId,
          status: "active",
          shareableLink,
        },
      });

      if (permission.workspaceId) {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: permission.workspaceId,
          eventType: "workspace.survey_updated",
          actorId: session.user.id,
          payload: {
            workspaceId: permission.workspaceId,
            survey: {
              id: surveyId,
              status: "active",
              shareableLink,
              title:
                typeof body.title === "string" && body.title.trim()
                  ? body.title.trim()
                  : briefRow.brief.title,
            },
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      survey: updatedSurvey,
      brief: briefRow.brief,
      coveragePlan: planRow.plan,
      shareableLink,
      shareUrl: `${env.APP_BASE_URL}/s/${shareableLink}`,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[Publish] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
