import { getPersonalityPreset, renderPersonalityContext, renderPlaybookContext } from "./playbooks";
import { getActivePersonalityAssignment, listEffectivePlaybooks } from "./storage";

export async function getConductingRuntimeLayers(params: {
  surveyId: string;
  organizationId?: string | null;
  mode: "sample" | "live";
}) {
  const [playbooks, assignment, sampleFallback] = await Promise.all([
    listEffectivePlaybooks({
      surveyId: params.surveyId,
      organizationId: params.organizationId ?? null,
      phase: "conducting",
    }),
    getActivePersonalityAssignment(params.surveyId, params.mode),
    params.mode === "live"
      ? getActivePersonalityAssignment(params.surveyId, "sample")
      : Promise.resolve(null),
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
    personalityAssignment: resolvedAssignment,
    personalityPreset: preset,
    playbooks,
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
