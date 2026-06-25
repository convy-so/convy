import { tool } from "ai";
import { z } from "zod";

import { updateSessionState } from "@/features/surveys/server/education/storage";
import type { SessionState } from "@/features/surveys/server/education/types";

export function createSampleFinishSurveyTool(params: {
  sessionId: string;
  minimumCoverage: number;
  getCurrentSessionState: () => SessionState;
  setCurrentSessionState: (state: SessionState) => void;
}) {
  return tool({
    description: "Finish the sample survey once coverage is high enough.",
    inputSchema: z.object({}),
    execute: async () => {
      const currentSessionState = params.getCurrentSessionState();

      if (
        currentSessionState.status !== "completed" &&
        currentSessionState.overallCoverage < params.minimumCoverage
      ) {
        return {
          error: "Interview coverage is not high enough to finish yet",
          currentCoverage: currentSessionState.overallCoverage,
          requiredCoverage: params.minimumCoverage,
        };
      }

      if (currentSessionState.status !== "completed") {
        const nextState: SessionState = {
          ...currentSessionState,
          status: "completed",
          stopReason: "agent_finish_signal",
        };
        params.setCurrentSessionState(nextState);
        await updateSessionState(params.sessionId, nextState);
      }

      return { success: true, message: "Survey marked as complete" };
    },
  });
}
