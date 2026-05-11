import { nanoid } from "nanoid";

import type { ChatMessage } from "@/lib/chat-types";
import { updateSessionState } from "@/lib/education/storage";
import type { CoveragePlan, SessionState } from "@/lib/education/types";
import type { ConversationTextEvent } from "@/lib/voice/deepgram-voice-agent";

const TRANSCRIPT_MERGE_WINDOW_MS = 3000;

export function appendConversationText(
  messages: ChatMessage[],
  event: ConversationTextEvent,
  now: Date = new Date(),
) {
  const lastMessage = messages[messages.length - 1];

  if (
    lastMessage &&
    lastMessage.role === event.role &&
    now.getTime() - new Date(lastMessage.timestamp).getTime() <
      TRANSCRIPT_MERGE_WINDOW_MS
  ) {
    lastMessage.content += ` ${event.content}`;
    lastMessage.timestamp = now.toISOString();
    return;
  }

  messages.push({
    id: nanoid(),
    role: event.role,
    content: event.content,
    timestamp: now.toISOString(),
  });
}

export function buildConductingProgressPayload(nextState: SessionState) {
  return {
    type: "progress",
    completionPercentage: Math.round(nextState.overallCoverage * 100),
    state: nextState.status,
    shouldWrapUp: nextState.status === "completed",
  };
}

export async function resolveFinishSurveyRequest(params: {
  sessionId: string;
  sessionState: SessionState;
  coveragePlan: CoveragePlan;
}) {
  const threshold = params.coveragePlan.completionRule.minimumRequiredNodeCoverage;

  if (
    params.sessionState.status !== "completed" &&
    params.sessionState.overallCoverage < threshold
  ) {
    return {
      ok: false as const,
      nextState: params.sessionState,
      response: {
        error: "Interview coverage is not high enough to finish yet",
        currentCoverage: params.sessionState.overallCoverage,
        requiredCoverage: threshold,
      },
    };
  }

  const nextState =
    params.sessionState.status === "completed"
      ? params.sessionState
      : {
          ...params.sessionState,
          status: "completed" as const,
          stopReason: "agent_finish_signal" as const,
        };

  if (nextState !== params.sessionState) {
    await updateSessionState(params.sessionId, nextState);
  }

  return {
    ok: true as const,
    nextState,
    response: {
      success: true,
      message: "Survey marked as complete",
    },
  };
}
