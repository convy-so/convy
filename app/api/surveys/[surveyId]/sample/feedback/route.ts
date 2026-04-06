import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/workspace-access";
import { sampleFeedbackEntryInputSchema } from "@/lib/education/sample-feedback";
import {
  applyFeedbackBriefPatch,
  buildConductingProfileFromPatch,
  compileSampleFeedback,
} from "@/lib/education/sample-feedback-workflow";
import {
  createSampleFeedbackEntry,
  createSampleFeedbackPatch,
  getActiveConductingProfile,
  getActiveCoveragePlan,
  getResearchBrief,
  replaceConductingProfile,
  replaceCoveragePlan,
  upsertResearchBrief,
} from "@/lib/education/storage";
import { validateBrief } from "@/lib/education/creation-workflow";

const MAX_SAMPLE_CONVERSATIONS = 3;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const parsed = sampleFeedbackEntryInputSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Invalid feedback payload" },
        { status: 400 },
      );
    }

    const input = parsed.data;
    if (input.conversationNumber >= MAX_SAMPLE_CONVERSATIONS) {
      return NextResponse.json(
        { error: `Max sample conversations reached (${MAX_SAMPLE_CONVERSATIONS})` },
        { status: 400 },
      );
    }

    const [survey, sampleConversation, briefRow, planRow] = await Promise.all([
      getDb().select().from(surveys).where(eq(surveys.id, surveyId)).then((rows) => rows[0]),
      getDb()
        .select()
        .from(sampleConversations)
        .where(
          and(
            eq(sampleConversations.surveyId, surveyId),
            eq(sampleConversations.conversationNumber, input.conversationNumber),
          ),
        )
        .then((rows) => rows[0]),
      getResearchBrief(surveyId),
      getActiveCoveragePlan(surveyId),
    ]);

    if (!survey) return new NextResponse("Survey not found", { status: 404 });
    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) return new NextResponse("Unauthorized", { status: 403 });
    if (survey.status !== "draft" && survey.status !== "sample_review") {
      return new NextResponse("Feedback can only be applied while the survey is in draft or sample review.", { status: 400 });
    }
    if (!sampleConversation) {
      return new NextResponse("Sample conversation not found", { status: 404 });
    }
    if (!briefRow || !planRow) {
      return new NextResponse("The survey brief is not ready for sample optimization.", { status: 400 });
    }

    const feedbackEntry = await createSampleFeedbackEntry({
      surveyId,
      sampleConversationId: sampleConversation.id,
      conversationNumber: input.conversationNumber,
      createdBy: session.user.id,
      feedbackInput: input,
    });

    const patch = compileSampleFeedback(input);
    const patchRow = await createSampleFeedbackPatch({
      surveyId,
      feedbackEntryId: feedbackEntry.id,
      conversationNumber: input.conversationNumber,
      status: patch.status,
      patch,
    });

    let briefUpdated = false;
    if ((patch.status === "approved" || patch.status === "partially_approved") && patch.briefPatch) {
      const result = applyFeedbackBriefPatch({
        surveyId,
        brief: briefRow.brief,
        currentPlan: planRow.plan,
        patch,
      });
      if (result.updated) {
        const validation = validateBrief(result.brief, result.brief.programId);
        await upsertResearchBrief({
          surveyId,
          programId: result.brief.programId,
          brief: {
            ...result.brief,
            missingFields: validation.missingFields,
            readyForSampling: validation.isReady,
          },
          completenessStatus: validation.isReady ? "ready" : "draft",
          approvalState: validation.isReady ? "approved" : "pending",
          missingFields: validation.missingFields,
          validationNotes: validation.notes,
        });
        await replaceCoveragePlan(surveyId, result.plan);
        briefUpdated = true;
      }
    }

    let profileVersion: number | null = null;
    if ((patch.status === "approved" || patch.status === "partially_approved") && patch.approvedChanges.length > 0) {
      const currentProfile = await getActiveConductingProfile(surveyId, "sample");
      const nextVersion = (currentProfile?.profile.version ?? 0) + 1;
      const profile = buildConductingProfileFromPatch({
        patchId: patchRow.id,
        mode: "sample",
        version: nextVersion,
        patch,
        baseProfile: currentProfile?.profile ?? null,
      });

      await replaceConductingProfile({
        surveyId,
        mode: "sample",
        sourcePatchId: patchRow.id,
        profile,
      });
      profileVersion = nextVersion;
    }

    return NextResponse.json({
      success: true,
      decision: {
        status: patch.status,
        summary: patch.summary,
        requiresClarification: patch.requiresClarification,
        clarificationQuestion: patch.clarificationQuestion,
        blockedReasons: patch.blockedReasons,
        approvedChanges: patch.approvedChanges,
        rejectedChanges: patch.rejectedChanges,
      },
      profileVersion,
      briefUpdated,
      nextConversationNumber: input.conversationNumber + 1,
    });
  } catch (error) {
    console.error("[Sample Feedback] Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
