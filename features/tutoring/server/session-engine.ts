import { z } from "zod";

import { generateStructuredOutput } from "@/shared/ai/model-generation";
import { renderGroundingUnits } from "@/features/tutoring/server/prompt-serializers";
import { tutorRuntimeService } from "@/features/tutoring/server/tutor-runtime-service";
import { selectGroundingUnitsForPrompt } from "@/features/tutoring/server/grounding-units";
import { buildAssessmentPreviewPrompt } from "@/features/tutoring/server/prompts/session-engine";
import {
  createDefaultLearningSessionState,
  learningSessionStateSchema,
  type LearningSessionState,
  type TopicSourceBoundary,
} from "@/features/tutoring/public-server";
import {
  LEARNING_DEFAULT_LOCALE,
  LEARNING_LIMITS,
  QUESTION_INTENT,
} from "@/shared/learning/constants";

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
      sourceBoundary: TopicSourceBoundary;
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
    sourceBoundary: params.access.topic.sourceBoundary,
    studentUserId: params.access.classroomStudent.userId,
    studyLanguage: params.runtimeContext?.studyLanguage ?? LEARNING_DEFAULT_LOCALE,
    state: params.state,
    interestProfile: null,
    recentMessages: [{ role: "user", content: params.userMessage }],
    latestUserText: params.userMessage,
  });

  return {
    response: "",
    completed: false,
    state: prepared.nextState,
    userIntent: QUESTION_INTENT.PHASE_RESPONSE,
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
          budgetTokens: LEARNING_LIMITS.assessmentPreviewGroundingBudgetTokens,
          maxUnits: LEARNING_LIMITS.assessmentPreviewGroundingMaxUnits,
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
