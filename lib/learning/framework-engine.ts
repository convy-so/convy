import { z } from "zod";

import { generateStructuredOutput } from "@/lib/ai/runtime";
import { buildFrameworkDecisionPrompt } from "@/lib/learning/prompting";
import {
  frameworkStateSchema,
  type ExpertTutorRuntimeModel,
  type FrameworkState,
  type StudentModelSnapshot,
} from "@/lib/learning/types";

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
    // Stage logic has been removed. The framework state remains the same
    // throughout the session, as the framework relies on brief and examples.
    return params.frameworkState;
  }
}

export const frameworkEngine = new FrameworkEngine();
