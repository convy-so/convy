import { z } from "zod";

import { generateStructuredOutput } from "@/lib/ai/runtime";
import { renderGroundingUnits } from "@/lib/learning/prompt-serializers";
import { tutorRuntimeService } from "@/lib/learning/tutor-runtime-service";
import { selectGroundingUnitsForPrompt } from "@/lib/learning/grounding-units";
import { buildAssessmentPreviewPrompt } from "@/lib/learning/prompts/session-engine";
import {
  createDefaultLearningSessionState,
  learningSessionStateSchema,
  type LearningSessionState,
} from "@/lib/learning/types";

export type TutoringRuntimeContext = {
  studyLanguage?: string;
  topicId?: string | null;
  classroomStudentId?: string | null;
};

const assessmentPreviewSchema = z.object({
  prompt: z.string(),
  expectedAnswer: z.string(),
  explanation: z.string(),
  questionType: z.string(),
  reasoningSkill: z.string(),
  difficulty: z.string(),
  acceptedStrategies: z.array(z.string()).default([]),
  hintLadder: z.array(z.string()).default([]),
  diagnosticTags: z.array(z.string()).default([]),
  evidenceRequirements: z.array(z.string()).default([]),
});

export function buildLearningSessionState(
  partial?: Partial<LearningSessionState> | null,
) {
  return learningSessionStateSchema.parse({
    ...createDefaultLearningSessionState(),
    ...(partial ?? {}),
  });
}

export async function runTutoringSessionTurn(params: {
  state: LearningSessionState;
  access: {
    topic: {
      id: string;
      title: string;
      sourceBoundary: Record<string, unknown>;
      classroomId?: string | null;
      classroom: Record<string, never>;
    };
    classroomStudent: { id: string; userId?: string | null };
  };
  userMessage: string;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const prepared = await tutorRuntimeService.prepareTurn({
    topicId: params.access.topic.id,
    topicTitle: params.access.topic.title,
    sourceBoundary: params.access.topic.sourceBoundary as never,
    studentUserId: params.access.classroomStudent.userId,
    studyLanguage: params.runtimeContext?.studyLanguage ?? "en",
    state: params.state,
    interestProfile: null,
    recentMessages: [{ role: "user", content: params.userMessage }],
    latestUserText: params.userMessage,
  });

  return {
    response: "",
    completed: false,
    state: prepared.nextState,
    userIntent: "phase_response" as const,
    systemPrompt: prepared.systemPrompt,
  };
}

export async function previewAssessmentQuestionForTopic(params: {
  topicTitle: string;
  retrievedContext: string[];
  contentScope?: LearningSessionState["contentScopeSnapshot"] | null;
  runtimeContext?: TutoringRuntimeContext;
  currentStageLabel?: string | null;
  questionType?: string;
  difficulty?: string;
}) {
  const groundedContext = params.contentScope
    ? renderGroundingUnits(
        selectGroundingUnitsForPrompt({
          contentScope: params.contentScope,
          query: [params.questionType, params.difficulty, params.currentStageLabel]
            .filter(Boolean)
            .join(" "),
          recentSummary: params.topicTitle,
          budgetTokens: 1_000,
          maxUnits: 6,
        }),
      )
    : params.retrievedContext.map((item) => `- ${item}`).join("\n");

  return await generateStructuredOutput({
    schema: assessmentPreviewSchema,
    prompt: buildAssessmentPreviewPrompt({
      topicTitle: params.topicTitle,
      currentStageLabel: params.currentStageLabel,
      retrievedContext: groundedContext,
      questionType: params.questionType,
      difficulty: params.difficulty,
    }),
  });
}
