import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { surveys } from "@/shared/db/schema";

export async function getSurveyById(surveyId: string) {
  const [survey] = await getDb()
    .select()
    .from(surveys)
    .where(eq(surveys.id, surveyId));
  return survey ?? null;
}

export async function getSurveyByShareableLink(shareableLink: string) {
  const [survey] = await getDb()
    .select()
    .from(surveys)
    .where(eq(surveys.shareableLink, shareableLink));
  return survey ?? null;
}

export {
  getActiveCoveragePlan,
  getResearchBrief,
  replaceCoveragePlan,
  upsertResearchBrief,
} from "../storage/brief-storage";

export {
  countLiveSessions,
  ensureSession,
  getSessionById,
  getSessionBySourceId,
  listEvidenceForSession,
  listEvidenceForSurvey,
  listEvidenceForSurveyByType,
  listSessionTurns,
  listSurveySessionInsights,
  listSurveySessionInsightsByType,
  listSurveySessionsByType,
  replaceEvidence,
  replaceSessionTurns,
  updateSessionState,
  upsertSessionInsight,
} from "../storage/session-storage";

export {
  getAnalyticsSnapshotByVersion,
  getAnalyticsState,
  getLatestAnalyticsSnapshot,
  listAnalyticsFactsForSurvey,
  listAnalyticsFactsForSurveyByType,
  listAnalyticsSnapshots,
  purgeSessionAnalyticsArtifacts,
  replaceAnalyticsFacts,
  replaceAnalyticsSnapshot,
  upsertAnalyticsState,
} from "../storage/analytics-storage";

export {
  createSampleFeedbackEntry,
  createSampleFeedbackPatch,
  getActiveConductingProfile,
  replaceConductingProfile,
} from "../storage/feedback-storage";

export {
  appendRefinementMessage,
  createRefinementProposal,
  createResearchBriefPatchRecord,
  getOrCreateRefinementThread,
  getRefinementProposal,
  listRefinementMessages,
  listRefinementProposals,
  updateRefinementProposalStatus,
} from "../storage/refinement-storage";
