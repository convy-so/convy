import type {
  ExpertTutorRuntimeModel,
  FrameworkState,
  StudentModelSnapshot,
} from "@/lib/learning/types";

export function buildFrameworkDecisionPrompt(params: {
  runtimeModel: ExpertTutorRuntimeModel;
  frameworkState: FrameworkState;
  studentModel: StudentModelSnapshot;
  latestStudentMessage: string;
  latestTutorMessage?: string | null;
}) {
  return `Decide the tutor's framework state for the next turn.

Compiled framework policy:
${JSON.stringify(params.runtimeModel.compiledPolicy ?? null, null, 2)}

Current framework state:
${JSON.stringify(params.frameworkState, null, 2)}

Student model summary:
${JSON.stringify({
    motivations: params.studentModel.motivationalContext,
    struggle: params.studentModel.productiveStruggleCalibration,
    knowledge: params.studentModel.knowledgeStateModel,
  }, null, 2)}

Latest tutor message:
${params.latestTutorMessage ?? "(none)"}

Latest student message:
${params.latestStudentMessage}

Rules:
- Respect diagnosis-first teaching when the policy requires it.
- Do not advance just because a turn happened.
- Do not jump more levels than the policy allows.
- Keep the current phase or level if evidence is still thin.
- Mark assessment, transfer, and reflection as pending only when the policy requires them.
- Mark closeRequirementsMet true only when the framework's completion policy is satisfied.`;
}
