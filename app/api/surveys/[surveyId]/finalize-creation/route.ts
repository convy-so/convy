import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveyCreationConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getResearchBrief, getActiveCoveragePlan } from "@/lib/education/storage";
import {
  recordRealtimeEvent,
} from "@/lib/collaboration-service";
import {
  getSurveyPermissionContext,
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;

    const [survey] = await getDb().select().from(surveys).where(eq(surveys.id, surveyId));
    if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (survey.status !== "creating") {
      return NextResponse.json({ error: "Survey has already been finalized", survey }, { status: 400 });
    }

    const [briefRow, planRow] = await Promise.all([
      getResearchBrief(surveyId),
      getActiveCoveragePlan(surveyId),
    ]);
    if (!briefRow || !planRow) {
      return NextResponse.json({ error: "The education brief is not ready yet." }, { status: 400 });
    }
    if (briefRow.missingFields.length > 0) {
      return NextResponse.json({
        error: "The brief is incomplete.",
        missingFields: briefRow.missingFields,
      }, { status: 400 });
    }

    let updatedSurvey: typeof surveys.$inferSelect | undefined;
    await getDb().transaction(async (tx) => {
      [updatedSurvey] = await tx
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

      await tx
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

      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId,
        workspaceId: permission.workspaceId,
        eventType: "survey.creation_turn_added",
        actorId: session.user.id,
        payload: {
          surveyId,
          status: "sample_review",
          readyForSampling: true,
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
              status: "sample_review",
              title: briefRow.brief.title,
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
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[Finalize Creation] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
