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

Framework:
${JSON.stringify(params.runtimeModel.framework)}

Current framework state:
${JSON.stringify(params.frameworkState)}

Student model summary:
${JSON.stringify({
    motivations: params.studentModel.motivationalContext,
    struggle: params.studentModel.productiveStruggleCalibration,
    knowledge: params.studentModel.knowledgeStateModel,
  })}

Latest tutor message:
${params.latestTutorMessage ?? "(none)"}

Latest student message:
${params.latestStudentMessage}

Choose whether to stay in the current stage or move to an allowed next stage.
Base the decision on the framework objective, exit criteria, and the student's actual reasoning signal.
Do not advance just because a turn happened.`;
}
