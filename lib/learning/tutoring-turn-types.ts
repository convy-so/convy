import type { UIMessage } from "ai";
import type { z } from "zod";

import type { tutorRuntimeService } from "@/lib/learning/tutor-runtime-service";
import type { learningSessionStateSchema } from "@/lib/learning/types";
import type { StudentTopicAccess } from "@/lib/learning/tutoring-route-orchestrator";

export type TutoringSessionState = z.infer<typeof learningSessionStateSchema>;

export type PreparedTutoringTurn = Awaited<ReturnType<typeof tutorRuntimeService.prepareTurn>>;

export type FinalizeTurnStep = {
  text?: string;
  toolCalls: unknown[];
  toolResults: Array<{ toolName: string; output: unknown }>;
};

export type FinalizeTutoringTurnParams = {
  topicId: string;
  tutorSessionId: string;
  state: TutoringSessionState;
  expectedStateVersion: number;
  latestUserText: string;
  access: StudentTopicAccess;
  sessionUserId: string;
  prepared: PreparedTutoringTurn;
  previousAssistantText: string | null;
  result: { steps: FinalizeTurnStep[] };
};

export type PrepareTutoringTurnParams = {
  topicId: string;
  access: StudentTopicAccess;
  tutorSessionId: string;
  studyLanguage: string;
  state: TutoringSessionState;
  latestUserText: string;
  messages: UIMessage[];
};
