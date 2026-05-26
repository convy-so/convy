import {
  addLearningPatternObservations,
  isMem0Configured,
  listLearningPatternMemories,
} from "@/lib/learning/mem0";
import {
  analyzeOnboardingLearningPatterns,
  analyzeSessionLearningPatterns,
  buildTeachingPlaybook,
  defaultLearningPatternProfile,
  deriveSubjectInfo,
  getPatternConfidenceLabel,
} from "@/lib/learning/patterns";
import type {
  LearningTeachingPlaybook,
  StudentLearningPatternProfile,
} from "@/lib/learning/pattern-types";
import type {
  LearningSessionState,
  StudentInterestProfile,
  TeacherProgressReport,
} from "@/lib/learning/types";
import { createLogger, serializeError } from "@/lib/logger";

type MemoryStateStatus = "ready" | "degraded" | "unavailable";

export type PatternMemoryState = {
  status: MemoryStateStatus;
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

type Mem0Memory = Awaited<
  ReturnType<typeof listLearningPatternMemories>
>[number];

const log = createLogger("pattern-memory");
const MEMORY_UNAVAILABLE_MESSAGE =
  "Long-horizon learning memory is unavailable. Tutoring continues without saved pattern recall.";

function readyState(): PatternMemoryState {
  return {
    status: "ready",
    message: null,
  };
}

function unavailableState(message = MEMORY_UNAVAILABLE_MESSAGE): PatternMemoryState {
  return {
    status: isMem0Configured() ? "degraded" : "unavailable",
    message,
  };
}

function getMemoryTimestamp(memory: Mem0Memory) {
  return memory.updated_at ?? memory.created_at ?? new Date().toISOString();
}

function getMemoryMetadataString(
  memory: Mem0Memory,
  key: string,
): string | null {
  const value = memory.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getMemoryMetadataNumber(
  memory: Mem0Memory,
  key: string,
): number | null {
  const value = memory.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

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
}): StudentLearningPatternProfile {
  const sorted = [...params.memories].sort((left, right) =>
    getMemoryTimestamp(right).localeCompare(getMemoryTimestamp(left)),
  );
  const latestTimestamp =
    sorted[0] ? getMemoryTimestamp(sorted[0]) : new Date().toISOString();
  const averageConfidence =
    sorted.reduce(
      (total, memory) => total + Math.max(getMemoryMetadataNumber(memory, "patternConfidence") ?? 0, 0),
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

async function safelyListMemories(params: Parameters<typeof listLearningPatternMemories>[0]) {
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

async function safelyAddObservations(
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

export async function summarizeStudentPatternMemory(params: {
  studentUserId: string;
}): Promise<PatternSummaryResult> {
  const { memories, memoryState } = await safelyListMemories({
    studentUserId: params.studentUserId,
    limit: 100,
  });

  if (memoryState.status !== "ready") {
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
    const subjectKey = getMemoryMetadataString(memory, "subjectKey") ?? "general";
    const current = subjectGroups.get(subjectKey) ?? [];
    current.push(memory);
    subjectGroups.set(subjectKey, current);
  }

  const profiles: StudentLearningPatternProfile[] = [];

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

export async function buildStudentTeachingPlaybook(params: {
  studentUserId: string;
  subjectKey?: string | null;
  subjectLabel?: string | null;
  topicLocalGaps?: string[];
  topicLocalUsedExamples?: string[];
}): Promise<TeachingPlaybookResult> {
  const summaries = await summarizeStudentPatternMemory({
    studentUserId: params.studentUserId,
  });

  if (summaries.memoryState.status !== "ready") {
    return {
      playbook: null,
      memoryState: summaries.memoryState,
    };
  }

  const globalProfile =
    summaries.profiles.find((profile) => profile.scopeType === "global") ?? null;
  const subjectInfo = deriveSubjectInfo({
    subjectKey: params.subjectKey ?? null,
    subjectLabel: params.subjectLabel ?? null,
  });
  const subjectProfile =
    summaries.profiles.find(
      (profile) =>
        profile.scopeType === "subject" &&
        profile.subjectKey === subjectInfo.subjectKey,
    ) ?? null;

  return {
    playbook: buildTeachingPlaybook({
      globalProfile,
      subjectProfile,
      topicLocalGaps: params.topicLocalGaps ?? [],
      topicLocalUsedExamples: params.topicLocalUsedExamples ?? [],
    }),
    memoryState: summaries.memoryState,
  };
}

export async function captureOnboardingPatternMemory(params: {
  studentName: string;
  studentUserId: string;
  classroomStudentId: string;
  classroomId?: string | null;
  sessionId: string;
  interestProfile: StudentInterestProfile;
  transcript: Array<{ role: string; content: string }>;
}) {
  const currentProfiles = await summarizeStudentPatternMemory({
    studentUserId: params.studentUserId,
  });

  if (currentProfiles.memoryState.status !== "ready") {
    return currentProfiles.memoryState;
  }

  const { profiles, observations } = await analyzeOnboardingLearningPatterns({
    studentName: params.studentName,
    studentUserId: params.studentUserId,
    classroomStudentId: params.classroomStudentId,
    interestProfile: params.interestProfile,
    transcript: params.transcript,
    currentProfiles: currentProfiles.profiles,
    relevantMemories: [],
  });

  const observationsToStore =
    observations.length > 0
      ? observations
      : profiles.map((profile) => ({
          scopeType: profile.scopeType,
          subjectKey: profile.subjectKey ?? null,
          memoryClass: "observation" as const,
          dimension: "onboarding_summary",
          text: profile.teacherSummary || profile.studentSummary,
          patternConfidence: Math.min(profile.patternConfidence, 0.25),
          metadata: {
            subjectLabel: profile.subjectLabel ?? null,
          },
        }));

  return await safelyAddObservations({
    studentUserId: params.studentUserId,
    sourceType: "onboarding",
    sourceId: params.sessionId,
    classroomId: params.classroomId ?? null,
    classroomStudentId: params.classroomStudentId,
    sourceCreatedAt: new Date().toISOString(),
    observations: observationsToStore,
  });
}

export async function captureCompletedSessionPatternMemory(params: {
  studentName: string;
  studentUserId: string;
  classroomId?: string | null;
  classroomStudentId: string;
  topicId: string;
  topicTitle: string;
  subjectKey?: string | null;
  subjectLabel?: string | null;
  sessionId: string;
  interestProfile: StudentInterestProfile;
  state: LearningSessionState;
  report: TeacherProgressReport;
  transcript: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
  outOfSessionEvidence?: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
}) {
  const summaries = await summarizeStudentPatternMemory({
    studentUserId: params.studentUserId,
  });

  if (summaries.memoryState.status !== "ready") {
    return summaries.memoryState;
  }

  const subjectInfo = deriveSubjectInfo({
    subjectKey: params.subjectKey ?? null,
    subjectLabel: params.subjectLabel ?? null,
  });
  const { observations } = await analyzeSessionLearningPatterns({
    studentName: params.studentName,
    subjectKey: subjectInfo.subjectKey,
    subjectLabel: subjectInfo.subjectLabel,
    topicTitle: params.topicTitle,
    interestProfile: params.interestProfile,
    state: params.state,
    report: params.report,
    transcript: params.transcript,
    outOfSessionEvidence: params.outOfSessionEvidence ?? [],
    currentProfiles: summaries.profiles,
    relevantMemories: [],
  });

  return await safelyAddObservations({
    studentUserId: params.studentUserId,
    sourceType: "session",
    sourceId: params.sessionId,
    classroomId: params.classroomId ?? null,
    classroomStudentId: params.classroomStudentId,
    topicId: params.topicId,
    sourceCreatedAt: new Date().toISOString(),
    observations: observations.map((observation) => ({
      ...observation,
      metadata: {
        ...observation.metadata,
        subjectLabel: subjectInfo.subjectLabel,
      },
    })),
  });
}
