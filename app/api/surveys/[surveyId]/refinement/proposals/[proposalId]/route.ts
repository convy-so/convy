import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  applyResearchBriefPatch,
  buildConductingProfileFromProposal,
  normalizeResearchBriefPatch,
} from "@/lib/education/refinement";
import { validateBrief } from "@/lib/education/creation-workflow";
import { sampleRequestedChangeSchema } from "@/lib/education/sample-feedback";
import {
  createResearchBriefPatchRecord,
  getActiveConductingProfile,
  getActiveCoveragePlan,
  getRefinementProposal,
  getResearchBrief,
  replaceConductingProfile,
  replaceCoveragePlan,
  updateRefinementProposalStatus,
  upsertResearchBrief,
} from "@/lib/education/storage";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/lib/survey-access";
import { z } from "zod";

const conductingProfilePayloadSchema = z.object({
  changes: z.array(sampleRequestedChangeSchema).optional(),
  summary: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ surveyId: string; proposalId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId, proposalId } = await params;
    const body = await req.json();
    const action = body.action === "reject" ? "reject" : "approve";

    const [survey, proposal] = await Promise.all([
      getDb().select().from(surveys).where(eq(surveys.id, surveyId)).then((rows) => rows[0]),
      getRefinementProposal(proposalId),
    ]);
    if (!survey || !proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (action === "reject") {
      await updateRefinementProposalStatus(proposalId, "rejected");
      return NextResponse.json({ success: true });
    }

    switch (proposal.type) {
      case "conducting_profile": {
        const payload = conductingProfilePayloadSchema.parse(proposal.payload);
        const currentSample = await getActiveConductingProfile(surveyId, "sample");
        const profile = buildConductingProfileFromProposal({
          version: (currentSample?.profile.version ?? 0) + 1,
          mode: "sample",
          summary: payload.summary || proposal.interpretation,
          sourcePatchId: proposalId,
          changes: payload.changes ?? [],
          baseProfile: currentSample?.profile ?? null,
        });
        await replaceConductingProfile({
          surveyId,
          mode: "sample",
          sourcePatchId: proposalId,
          profile,
        });

        if (body.applyToLive) {
          const currentLive = await getActiveConductingProfile(surveyId, "live");
          await replaceConductingProfile({
            surveyId,
            mode: "live",
            sourcePatchId: proposalId,
            profile: {
              ...profile,
              mode: "live",
              version: (currentLive?.profile.version ?? 0) + 1,
              createdAt: new Date().toISOString(),
            },
          });
        }
        break;
      }
      case "brief_patch": {
        const [briefRow, planRow] = await Promise.all([
          getResearchBrief(surveyId),
          getActiveCoveragePlan(surveyId),
        ]);
        if (!briefRow || !planRow) {
          return NextResponse.json({ error: "The survey brief is not ready." }, { status: 400 });
        }
        const patch = normalizeResearchBriefPatch(
          typeof proposal.payload === "object" && proposal.payload !== null
            ? proposal.payload
            : {},
        );
        const result = applyResearchBriefPatch({
          surveyId,
          brief: briefRow.brief,
          currentPlan: planRow.plan,
          patch,
        });
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
          approvalState: validation.isReady ? "sample_ready" : "pending",
          missingFields: validation.missingFields,
          validationNotes: validation.notes,
        });
        await replaceCoveragePlan(surveyId, result.plan);
        await createResearchBriefPatchRecord({
          surveyId,
          proposalId,
          patch,
          createdBy: session.user.id,
        });
        break;
      }
      default:
        return NextResponse.json({ error: "Unsupported proposal type" }, { status: 400 });
    }

    await updateRefinementProposalStatus(proposalId, "approved");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Refinement Proposal POST] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
