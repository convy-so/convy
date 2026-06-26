import { z } from "zod";

import { generateStructuredOutput } from "@/shared/ai/model-generation";
import { renderGroundingUnits } from "@/features/tutoring/server/prompt-serializers";
import { tutorRuntimeService } from "@/features/tutoring/server/tutor-runtime-service";
import { selectGroundingUnitsForPrompt } from "@/features/tutoring/server/grounding-units";
import { buildAssessmentPreviewPrompt } from "@/features/tutoring/server/prompts/session-engine";
import {
  createDefaultStudentSessionState,
  studentSessionStateSchema,
  type StudentSessionState,
  type LessonSourceBoundary,
} from "@/features/tutoring/public-server";
import {
  TUTORING_DEFAULT_LOCALE,
  TUTORING_LIMITS,
  QUESTION_INTENT,
} from "@/shared/tutoring/constants";

export type TutoringRuntimeContext = {
  studyLanguage?: string;
  lessonId?: string | null;
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

export function buildStudentSessionState(
  partial?: Partial<StudentSessionState> | null,
) {
  return studentSessionStateSchema.parse({
    ...createDefaultStudentSessionState(),
    ...(partial ?? {}),
  });
}

export async function runTutoringSessionTurn(params: {
  state: StudentSessionState;
  access: {
    lesson: {
      id: string;
      title: string;
      sourceBoundary: LessonSourceBoundary;
      classroomId?: string | null;
      classroom: Record<string, never>;
    };
    classroomStudent: { id: string; userId?: string | null };
  };
  userMessage: string;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const prepared = await tutorRuntimeService.prepareTurn({
    lessonId: params.access.lesson.id,
    lessonTitle: params.access.lesson.title,
    sourceBoundary: params.access.lesson.sourceBoundary,
    studentUserId: params.access.classroomStudent.userId,
    studyLanguage: params.runtimeContext?.studyLanguage ?? TUTORING_DEFAULT_LOCALE,
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

export async function previewAssessmentQuestionForLesson(params: {
  lessonTitle: string;
  retrievedContext: string[];
  contentScope?: StudentSessionState["contentScopeSnapshot"] | null;
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
          recentSummary: params.lessonTitle,
          budgetTokens: TUTORING_LIMITS.assessmentPreviewGroundingBudgetTokens,
          maxUnits: TUTORING_LIMITS.assessmentPreviewGroundingMaxUnits,
        }),
      )
    : params.retrievedContext.map((item) => `- ${item}`).join("\n");

  return await generateStructuredOutput({
    schema: assessmentPreviewSchema,
    prompt: buildAssessmentPreviewPrompt({
      lessonTitle: params.lessonTitle,
      currentStageLabel: params.currentStageLabel,
      retrievedContext: groundedContext,
      questionType: params.questionType,
      difficulty: params.difficulty,
    }),
  });
}


