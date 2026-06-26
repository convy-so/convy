import type { UIMessage } from "ai";
import type { z } from "zod";

import type { tutorRuntimeService } from "@/features/tutoring/server/tutor-runtime-service";
import type { studentSessionStateSchema } from "@/features/tutoring/public-server";
import type { StudentLessonAccess } from "@/features/tutoring/server/tutoring-route-orchestrator";

export type TutoringSessionState = z.infer<typeof studentSessionStateSchema>;

export type PreparedTutoringTurn = Awaited<ReturnType<typeof tutorRuntimeService.prepareTurn>>;

export type FinalizeTurnStep = {
  text?: string;
  toolCalls: Array<{
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    args?: unknown;
  }>;
  toolResults: Array<{
    toolCallId?: string;
    toolName: string;
    input?: unknown;
    output: unknown;
  }>;
};

export type FinalizeTutoringTurnParams = {
  lessonId: string;
  tutorSessionId: string;
  state: TutoringSessionState;
  expectedStateVersion: number;
  latestUserText: string;
  access: StudentLessonAccess;
  sessionUserId: string;
  prepared: PreparedTutoringTurn;
  previousAssistantText: string | null;
  result: { steps: FinalizeTurnStep[] };
};

export type PrepareTutoringTurnParams = {
  lessonId: string;
  access: StudentLessonAccess;
  tutorSessionId: string;
  studyLanguage: string;
  state: TutoringSessionState;
  latestUserText: string;
  messages: UIMessage[];
};

