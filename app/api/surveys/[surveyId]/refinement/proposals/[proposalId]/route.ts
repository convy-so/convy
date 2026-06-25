import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/shared/http/api-error";
import { readJsonRequestValue } from "@/shared/http/json";

import { getDb } from "@/shared/db";
import { surveys } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import {
  applyResearchBriefPatch,
  buildConductingProfileFromProposal,
  normalizeResearchBriefPatch,
} from "@/features/surveys/server/education/refinement";
import { validateBrief } from "@/features/surveys/server/education/creation-workflow";
import { sampleRequestedChangeSchema } from "@/features/surveys/server/education/sample-feedback";
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
} from "@/features/surveys/server/education/storage";
import {
  getSurveyPermissionForSession,
  hasSurveyPermission,
} from "@/features/surveys/public-server";
import { z } from "zod";

const conductingProfilePayloadSchema = z.object({
  changes: z.array(sampleRequestedChangeSchema).optional(),
  summary: z.string().optional(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getProposalAction(value: unknown): "approve" | "reject" {
  return isRecord(value) && value.action === "reject" ? "reject" : "approve";
}

function shouldApplyProposalToLive(value: unknown): boolean {
  return isRecord(value) && value.applyToLive === true;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ surveyId: string; proposalId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId, proposalId } = await params;
    const body = await readJsonRequestValue(req);
    const action = getProposalAction(body);

    const [survey, proposal] = await Promise.all([
      getDb().select().from(surveys).where(eq(surveys.id, surveyId)).then((rows) => rows[0]),
      getRefinementProposal(proposalId),
    ]);
    if (!survey || !proposal) { return apiError("NOT_FOUND", "Not found"); }

    const permission = await getSurveyPermissionForSession(session, surveyId);
    if (!hasSurveyPermission(permission, "canEdit")) { return apiError("UNAUTHORIZED", "Unauthorized"); }

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

        if (shouldApplyProposalToLive(body)) {
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
        if (!briefRow || !planRow) { return apiError("VALIDATION_ERROR", "The survey brief is not ready."); }
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
        return apiError("VALIDATION_ERROR", "Unsupported proposal type");
    }

    await updateRefinementProposalStatus(proposalId, "approved");
    return NextResponse.json({ success: true });
  } catch (error) { return apiUnhandledError(error, "Internal server error", "/api/surveys/[surveyId]/refinement/proposals/[proposalId]:post"); }
}

