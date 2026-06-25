import { unstable_cache } from "next/cache";

import {
  buildTeachingPlaybook,
  deriveSubjectInfo,
} from "@/features/tutoring/server/patterns";
import { createTutoringTimer } from "@/features/tutoring/public-server";

import type { TeachingPlaybookResult } from "./model";
import { log } from "./model";
import { summarizeStudentPatternMemory } from "./summarize";

const cachedBuildStudentTeachingPlaybook = unstable_cache(
  async (
    studentUserId: string,
    subjectKey: string | null,
    subjectLabel: string | null,
  ) =>
    await buildStudentTeachingPlaybookImpl({
      studentUserId,
      subjectKey,
      subjectLabel,
      topicLocalGaps: [],
      topicLocalUsedExamples: [],
    }),
  ["learning-student-teaching-playbook"],
  { revalidate: 300 },
);

export async function buildStudentTeachingPlaybook(params: {
  studentUserId: string;
  subjectKey?: string | null;
  subjectLabel?: string | null;
  topicLocalGaps?: string[];
  topicLocalUsedExamples?: string[];
}): Promise<TeachingPlaybookResult> {
  if (
    (params.topicLocalGaps?.length ?? 0) === 0 &&
    (params.topicLocalUsedExamples?.length ?? 0) === 0
  ) {
    return await cachedBuildStudentTeachingPlaybook(
      params.studentUserId,
      params.subjectKey ?? null,
      params.subjectLabel ?? null,
    );
  }

  return await buildStudentTeachingPlaybookImpl(params);
}

async function buildStudentTeachingPlaybookImpl(params: {
  studentUserId: string;
  subjectKey?: string | null;
  subjectLabel?: string | null;
  topicLocalGaps?: string[];
  topicLocalUsedExamples?: string[];
}): Promise<TeachingPlaybookResult> {
  const timer = createTutoringTimer();
  const summaries = await summarizeStudentPatternMemory({
    studentUserId: params.studentUserId,
  });

  if (summaries.memoryState.status !== "ready") {
    log.debug("Student teaching playbook unavailable", {
      studentUserId: params.studentUserId,
      status: summaries.memoryState.status,
      durationMs: timer.elapsedMs(),
    });
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

  const playbook = buildTeachingPlaybook({
    globalProfile,
    subjectProfile,
    topicLocalGaps: params.topicLocalGaps ?? [],
    topicLocalUsedExamples: params.topicLocalUsedExamples ?? [],
  });
  log.debug("Student teaching playbook built", {
    studentUserId: params.studentUserId,
    durationMs: timer.elapsedMs(),
    hasGlobalProfile: Boolean(globalProfile),
    hasSubjectProfile: Boolean(subjectProfile),
  });

  return {
    playbook,
    memoryState: summaries.memoryState,
  };
}
