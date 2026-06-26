import { unstable_cache } from "next/cache";

import {
  defaultLearningPatternProfile,
  getPatternConfidenceLabel,
} from "@/features/tutoring/server/patterns";
import type { StudentPatternProfile } from "@/features/tutoring/server/pattern-types";
import { createTutoringTimer, measureTutoringStep } from "@/features/tutoring/public-server";
import { TUTORING_SUBJECT_DEFAULTS } from "@/shared/tutoring/constants";

import {
  type Mem0Memory,
  type PatternSummaryResult,
  getMemoryMetadataNumber,
  getMemoryMetadataString,
  getMemoryTimestamp,
  log,
  safelyListMemories,
} from "./model";

function summarizeObservations(memories: Mem0Memory[]) {
  return memories
    .slice(0, 3)
    .map((memory) => memory.memory?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function buildProfileFromMemories(params: {
  scopeType: "global" | "subject";
  subjectKey?: string | null;
  subjectLabel?: string | null;
  memories: Mem0Memory[];
}): StudentPatternProfile {
  const sorted = [...params.memories].sort((left, right) =>
    getMemoryTimestamp(right).localeCompare(getMemoryTimestamp(left)),
  );
  const latestTimestamp =
    sorted[0] ? getMemoryTimestamp(sorted[0]) : new Date().toISOString();
  const averageConfidence =
    sorted.reduce(
      (total, memory) =>
        total + Math.max(getMemoryMetadataNumber(memory, "patternConfidence") ?? 0, 0),
      0,
    ) / Math.max(sorted.length, 1);
  const confidence = Math.max(
    averageConfidence,
    Math.min(0.9, averageConfidence + sorted.length * 0.12),
  );
  const summary = summarizeObservations(sorted);

  return {
    ...defaultLearningPatternProfile({
      scopeType: params.scopeType,
      subjectKey: params.subjectKey ?? null,
      subjectLabel: params.subjectLabel ?? null,
    }),
    patternConfidence: confidence,
    confidenceLabel: getPatternConfidenceLabel(confidence),
    onboardingObservations: summary,
    studentSummary:
      summary ||
      "The tutor is still collecting enough evidence to form a stable long-term pattern.",
    teacherSummary:
      summary ||
      "Long-horizon memory has not accumulated enough evidence for a stable pattern yet.",
    updatedAt: latestTimestamp,
  };
}

const cachedSummarizeStudentPatternMemory = unstable_cache(
  async (studentUserId: string) =>
    await summarizeStudentPatternMemoryImpl({ studentUserId }),
  ["student-pattern-memory"],
  { revalidate: 60 },
);

export async function summarizeStudentPatternMemory(params: {
  studentUserId: string;
}): Promise<PatternSummaryResult> {
  return await cachedSummarizeStudentPatternMemory(params.studentUserId);
}

async function summarizeStudentPatternMemoryImpl(params: {
  studentUserId: string;
}): Promise<PatternSummaryResult> {
  const timer = createTutoringTimer();
  const { memories, memoryState } = await measureTutoringStep(
    "pattern-memory:summarize:list",
    {
      studentUserId: params.studentUserId,
      limit: 100,
    },
    async () =>
      await safelyListMemories({
        studentUserId: params.studentUserId,
        limit: 100,
      }),
  );

  if (memoryState.status !== "ready") {
    log.warn("Student pattern memory unavailable", {
      studentUserId: params.studentUserId,
      status: memoryState.status,
      durationMs: timer.elapsedMs(),
    });
    return {
      profiles: [],
      memoryState,
    };
  }

  const observationMemories = memories.filter(
    (memory) => getMemoryMetadataString(memory, "memoryClass") !== "playbook",
  );
  const globalMemories = observationMemories.filter(
    (memory) => getMemoryMetadataString(memory, "scopeType") === "global",
  );
  const subjectGroups = new Map<string, Mem0Memory[]>();

  for (const memory of observationMemories) {
    if (getMemoryMetadataString(memory, "scopeType") !== "subject") continue;
    const subjectKey =
      getMemoryMetadataString(memory, "subjectKey") ??
      TUTORING_SUBJECT_DEFAULTS.key;
    const current = subjectGroups.get(subjectKey) ?? [];
    current.push(memory);
    subjectGroups.set(subjectKey, current);
  }

  const profiles: StudentPatternProfile[] = [];

  if (globalMemories.length > 0) {
    profiles.push(
      buildProfileFromMemories({
        scopeType: "global",
        memories: globalMemories,
      }),
    );
  }

  for (const [subjectKey, groupedMemories] of subjectGroups.entries()) {
    const subjectLabel =
      (groupedMemories[0]
        ? getMemoryMetadataString(groupedMemories[0], "subjectLabel")
        : null) ?? subjectKey;
    profiles.push(
      buildProfileFromMemories({
        scopeType: "subject",
        subjectKey,
        subjectLabel,
        memories: groupedMemories,
      }),
    );
  }

  log.debug("Student pattern memory summarized", {
    studentUserId: params.studentUserId,
    profileCount: profiles.length,
    durationMs: timer.elapsedMs(),
  });

  return {
    profiles: profiles.sort((left, right) => {
      if (left.scopeType !== right.scopeType) {
        return left.scopeType === "global" ? -1 : 1;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    }),
    memoryState,
  };
}

