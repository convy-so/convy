import { getPersonalityPreset, renderPersonalityContext, renderPlaybookContext } from "./playbooks";
import { getActivePersonalityAssignment, listEffectivePlaybooks } from "./storage";
import {
  listActiveExpertGuidance,
  renderExpertGuidanceContext,
} from "@/lib/ai/guidance";

export async function getConductingRuntimeLayers(params: {
  surveyId: string;
  organizationId?: string | null;
  classroomId?: string | null;
  programId?: string | null;
  language?: string | null;
  mode: "sample" | "live";
}) {
  const [playbooks, assignment, sampleFallback, expertGuidance] = await Promise.all([
    listEffectivePlaybooks({
      surveyId: params.surveyId,
      organizationId: params.organizationId ?? null,
      phase: "conducting",
    }),
    getActivePersonalityAssignment(params.surveyId, params.mode),
    params.mode === "live"
      ? getActivePersonalityAssignment(params.surveyId, "sample")
      : Promise.resolve(null),
    listActiveExpertGuidance({
      feature: "survey_conducting",
      artifactTypes: [
        "interviewing_strategy",
        "coverage_rules",
        "participant_safety",
        "language_style",
      ],
      selectors: {
        organizationId: params.organizationId ?? null,
        classroomId: params.classroomId ?? null,
        topicId: params.surveyId,
        programId: params.programId ?? null,
        language: params.language ?? null,
      },
    }),
  ]);

  const resolvedAssignment = assignment ?? sampleFallback;
  const preset = getPersonalityPreset(resolvedAssignment?.assignment.presetId);
  return {
    playbookContext: renderPlaybookContext(
      playbooks.map((record) => ({
        name: record.playbook.name,
        phase: record.playbook.phase,
        scope: record.playbook.scope,
        interpretation: record.activeVersion!.interpretation,
      })),
    ),
    personalityContext: renderPersonalityContext(
      preset,
      resolvedAssignment?.assignment.overlay ?? null,
    ),
    expertGuidanceContext: renderExpertGuidanceContext(expertGuidance),
    expertGuidanceVersionIds: expertGuidance.map((item) => item.versionId),
    personalityAssignment: resolvedAssignment,
    personalityPreset: preset,
    playbooks,
    expertGuidance,
  };
}

export async function getPhasePlaybookContext(params: {
  surveyId: string;
  organizationId?: string | null;
  phase: "creation" | "conducting" | "analytics";
}) {
  const playbooks = await listEffectivePlaybooks({
    surveyId: params.surveyId,
    organizationId: params.organizationId ?? null,
    phase: params.phase,
  });
  return renderPlaybookContext(
    playbooks.map((record) => ({
      name: record.playbook.name,
      phase: record.playbook.phase,
      scope: record.playbook.scope,
      interpretation: record.activeVersion!.interpretation,
    })),
  );
}
