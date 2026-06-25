import {
  addLearningPatternObservations,
  isMem0Configured,
  listLearningPatternMemories,
} from "@/features/tutoring/public-server";
import type {
  LearningTeachingPlaybook,
  StudentLearningPatternProfile,
} from "@/features/tutoring/server/pattern-types";
import { createLogger, serializeError } from "@/shared/infra/logger";

export type PatternMemoryState = {
  status: "ready" | "degraded" | "unavailable";
  message: string | null;
};

export type PatternSummaryResult = {
  profiles: StudentLearningPatternProfile[];
  memoryState: PatternMemoryState;
};

export type TeachingPlaybookResult = {
  playbook: LearningTeachingPlaybook | null;
  memoryState: PatternMemoryState;
};

export type Mem0Memory = Awaited<ReturnType<typeof listLearningPatternMemories>>[number];

export const log = createLogger("pattern-memory");
const MEMORY_UNAVAILABLE_MESSAGE =
  "Long-horizon learning memory is unavailable. Tutoring continues without saved pattern recall.";

export function readyState(): PatternMemoryState {
  return {
    status: "ready",
    message: null,
  };
}

export function unavailableState(message = MEMORY_UNAVAILABLE_MESSAGE): PatternMemoryState {
  return {
    status: isMem0Configured() ? "degraded" : "unavailable",
    message,
  };
}

export function getMemoryTimestamp(memory: Mem0Memory) {
  return memory.updated_at ?? memory.created_at ?? new Date().toISOString();
}

export function getMemoryMetadataString(
  memory: Mem0Memory,
  key: string,
): string | null {
  const value = memory.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function getMemoryMetadataNumber(
  memory: Mem0Memory,
  key: string,
): number | null {
  const value = memory.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function safelyListMemories(params: Parameters<typeof listLearningPatternMemories>[0]) {
  if (!isMem0Configured()) {
    return {
      memories: [] as Mem0Memory[],
      memoryState: unavailableState(),
    };
  }

  try {
    return {
      memories: await listLearningPatternMemories(params),
      memoryState: readyState(),
    };
  } catch (error) {
    log.warn("Mem0 list failed; degrading pattern recall", serializeError(error));
    return {
      memories: [] as Mem0Memory[],
      memoryState: unavailableState(),
    };
  }
}

export async function safelyAddObservations(
  params: Parameters<typeof addLearningPatternObservations>[0],
) {
  if (!isMem0Configured()) {
    return unavailableState();
  }

  try {
    await addLearningPatternObservations(params);
    return readyState();
  } catch (error) {
    log.warn("Mem0 write failed; skipping pattern persistence", serializeError(error));
    return unavailableState();
  }
}
