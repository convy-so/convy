import {
  listActiveExpertGuidance,
  renderExpertGuidanceContext,
} from "@/lib/ai/guidance";

export async function getConductingRuntimeLayers(params: {
  surveyId: string;
  classroomId?: string | null;
  programId?: string | null;
  language?: string | null;
  mode: "sample" | "live";
}) {
  const [expertGuidance] = await Promise.all([
    listActiveExpertGuidance({
      feature: "survey_conducting",
      artifactTypes: [
        "interviewing_strategy",
        "coverage_rules",
        "participant_safety",
        "language_style",
      ],
      selectors: {
        classroomId: params.classroomId ?? null,
        topicId: params.surveyId,
        programId: params.programId ?? null,
        language: params.language ?? null,
      },
    }),
  ]);

  return {
    expertGuidanceContext: renderExpertGuidanceContext(expertGuidance),
    expertGuidanceVersionIds: expertGuidance.map((item) => item.versionId),
    expertGuidance,
  };
}
