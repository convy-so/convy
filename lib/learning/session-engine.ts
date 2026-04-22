import { z } from "zod";

import { generateStructuredOutput } from "@/lib/ai/runtime";
import { tutorRuntimeService } from "@/lib/learning/tutor-runtime-service";
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
    classroomId: params.access.topic.classroomId,
    classroomStudentId: params.access.classroomStudent.id,
    studentUserId: params.access.classroomStudent.userId,
    studyLanguage: params.runtimeContext?.studyLanguage ?? "en",
    state: params.state,
    latestStudentMessage: params.userMessage,
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
  runtimeContext?: TutoringRuntimeContext;
  currentStageLabel?: string | null;
}) {
  return await generateStructuredOutput({
    schema: assessmentPreviewSchema,
    prompt: `Generate a pedagogically strong assessment question for the topic "${params.topicTitle}".

Current stage: ${params.currentStageLabel ?? "unknown"}

Retrieved course context:
${params.retrievedContext.map((item) => `- ${item}`).join("\n")}

Rules:
- stay inside the retrieved course context
- prefer conceptual depth over rote recall
- make the prompt expose genuine understanding
      - include a hint ladder and evidence requirements`,
  });
}
