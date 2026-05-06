import { and, eq } from "drizzle-orm";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { sampleConversations, surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";
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

    if (!parsed.success) { return apiError("VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid feedback payload"); }

    const input = parsed.data;
    if (input.conversationNumber >= MAX_SAMPLE_CONVERSATIONS) { return apiError("VALIDATION_ERROR", `Max sample conversations reached (${MAX_SAMPLE_CONVERSATIONS})`); }

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

    if (!survey) { return apiError("NOT_FOUND", "Survey not found"); }
    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) return new NextResponse("Unauthorized", { status: 403 });
    if (survey.status !== "draft" && survey.status !== "sample_review") { return apiError("VALIDATION_ERROR", "Feedback can only be applied while the survey is in draft or sample review."); }
    if (!sampleConversation) { return apiError("NOT_FOUND", "Sample conversation not found"); }
    if (!briefRow || !planRow) { return apiError("VALIDATION_ERROR", "The survey brief is not ready for sample optimization."); }

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
  } catch (error) { return apiUnhandledError(error, "Internal server error", "survey-sample-feedback:post"); }
}

