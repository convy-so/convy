import { z } from "zod";

import { generateStructuredOutput } from "@/lib/ai/runtime";
import { buildFrameworkDecisionPrompt } from "@/lib/learning/prompting";
import {
  frameworkStateSchema,
  type ExpertTutorRuntimeModel,
  type FrameworkState,
  type StudentModelSnapshot,
} from "@/lib/learning/types";

const frameworkDecisionSchema = z.object({
  currentStageId: z.string(),
  reasoning: z.string(),
});

export class FrameworkEngine {
  async decideNextState(params: {
    runtimeModel: ExpertTutorRuntimeModel;
    frameworkState: FrameworkState;
    studentModel: StudentModelSnapshot;
    latestStudentMessage: string;
    latestTutorMessage?: string | null;
    sessionId?: string | null;
    userId?: string | null;
  }): Promise<FrameworkState> {
    const currentStage =
      params.runtimeModel.framework.stages.find(
        (stage) => stage.id === params.frameworkState.currentStageId,
      ) ?? params.runtimeModel.framework.stages[0];

    const decision = await generateStructuredOutput({
      schema: frameworkDecisionSchema,
      prompt: buildFrameworkDecisionPrompt(params),

    });

    const requestedStage =
      params.runtimeModel.framework.stages.find(
        (stage) => stage.id === decision.currentStageId,
      ) ?? currentStage;

    const allowed =
      requestedStage.id === currentStage.id ||
      currentStage.allowedNextStageIds.includes(requestedStage.id);

    const nextStage = allowed ? requestedStage : currentStage;
    const now = new Date().toISOString();

    return frameworkStateSchema.parse({
      ...params.frameworkState,
      currentStageId: nextStage.id,
      stageStartedAt: {
        ...params.frameworkState.stageStartedAt,
        [nextStage.id]:
          params.frameworkState.stageStartedAt[nextStage.id] ?? now,
      },
      stageCompletedAt:
        nextStage.id !== currentStage.id
          ? {
              ...params.frameworkState.stageCompletedAt,
              [currentStage.id]:
                params.frameworkState.stageCompletedAt[currentStage.id] ?? now,
            }
          : params.frameworkState.stageCompletedAt,
      completedStageIds:
        nextStage.id !== currentStage.id
          ? Array.from(
              new Set([
                ...params.frameworkState.completedStageIds,
                currentStage.id,
              ]),
            )
          : params.frameworkState.completedStageIds,
      stageAttemptCounts: {
        ...params.frameworkState.stageAttemptCounts,
        [nextStage.id]:
          (params.frameworkState.stageAttemptCounts[nextStage.id] ?? 0) + 1,
      },
      lastTransitionAt: now,
      lastTransitionReason: decision.reasoning,
    });
  }
}

export const frameworkEngine = new FrameworkEngine();
