import { z } from "zod";

import { generateStructuredOutput } from "@/lib/ai/runtime";
import { buildFrameworkDecisionPrompt } from "@/lib/learning/prompting";
import {
  frameworkStateSchema,
  type CompiledFrameworkPolicy,
  type ExpertTutorRuntimeModel,
  type FrameworkState,
  type StudentModelSnapshot,
} from "@/lib/learning/types";

const frameworkDecisionSchema = z.object({
  currentPhaseId: z.string().nullable().default(null),
  currentLevelId: z.string().nullable().default(null),
  targetOutcomeId: z.string().nullable().default(null),
  diagnosticStatus: z
    .enum(["not_started", "in_progress", "complete"])
    .default("in_progress"),
  recommendedMove: z.string().min(1).default("probe"),
  assessmentPending: z.boolean().default(false),
  transferPending: z.boolean().default(false),
  reflectionPending: z.boolean().default(false),
  closeRequirementsMet: z.boolean().default(false),
  frameworkSignals: z.array(z.string()).default([]),
  activeMisconceptionTags: z.array(z.string()).default([]),
  transitionReason: z.string().default(""),
});

function normalizeChoice(
  value: string | null,
  allowed: string[],
  fallback: string,
) {
  return value && allowed.includes(value) ? value : fallback;
}

function resolveDefaultState(
  policy: CompiledFrameworkPolicy,
  frameworkState: FrameworkState,
) {
  const phaseIds = policy.phases.map((phase) => phase.id);
  const levelIds = policy.levels.map((level) => level.id);

  return frameworkStateSchema.parse({
    ...frameworkState,
    currentPhaseId: normalizeChoice(
      frameworkState.currentPhaseId,
      phaseIds,
      policy.defaultPhaseId,
    ),
    currentLevelId: normalizeChoice(
      frameworkState.currentLevelId,
      levelIds,
      policy.defaultLevelId,
    ),
  });
}

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
    const policy = params.runtimeModel.compiledPolicy;
    if (!policy) {
      return frameworkStateSchema.parse(params.frameworkState);
    }

    const currentState = resolveDefaultState(policy, params.frameworkState);

    try {
      const decision = await generateStructuredOutput({
        schema: frameworkDecisionSchema,
        prompt: buildFrameworkDecisionPrompt({
          runtimeModel: params.runtimeModel,
          frameworkState: currentState,
          studentModel: params.studentModel,
          latestStudentMessage: params.latestStudentMessage,
          latestTutorMessage: params.latestTutorMessage,
        }),
        maxOutputTokens: 900,
      });

      return frameworkStateSchema.parse({
        ...currentState,
        currentPhaseId: normalizeChoice(
          decision.currentPhaseId,
          policy.phases.map((phase) => phase.id),
          currentState.currentPhaseId ?? policy.defaultPhaseId,
        ),
        currentLevelId: normalizeChoice(
          decision.currentLevelId,
          policy.levels.map((level) => level.id),
          currentState.currentLevelId ?? policy.defaultLevelId,
        ),
        targetOutcomeId: decision.targetOutcomeId,
        diagnosticStatus: decision.diagnosticStatus,
        recommendedMove: decision.recommendedMove,
        assessmentPending: decision.assessmentPending,
        transferPending: decision.transferPending,
        reflectionPending: decision.reflectionPending,
        closeRequirementsMet: decision.closeRequirementsMet,
        frameworkSignals: decision.frameworkSignals,
        activeMisconceptionTags: decision.activeMisconceptionTags,
        lastTransitionAt: new Date().toISOString(),
        lastTransitionReason: decision.transitionReason,
      });
    } catch {
      return frameworkStateSchema.parse({
        ...currentState,
        lastTransitionAt: new Date().toISOString(),
        lastTransitionReason:
          "Framework decision fallback: retained prior state after policy evaluation failure",
      });
    }
  }
}

export const frameworkEngine = new FrameworkEngine();
