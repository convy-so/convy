import {
  buildTeachingPlaybook,
  deriveSubjectInfo,
} from "@/features/tutoring/server/patterns";
import { createTutoringTimer } from "@/features/tutoring/public-server";
import { cache } from "@/shared/infra/cache";

import type { TeachingPlaybookResult } from "./model";
import { log } from "./model";
import { summarizeStudentPatternMemory } from "./summarize";

export async function buildStudentTeachingPlaybook(params: {
  studentUserId: string;
  subjectKey?: string | null;
  subjectLabel?: string | null;
  lessonLocalGaps?: string[];
  lessonLocalUsedExamples?: string[];
}): Promise<TeachingPlaybookResult> {
  if (
    (params.lessonLocalGaps?.length ?? 0) === 0 &&
    (params.lessonLocalUsedExamples?.length ?? 0) === 0
  ) {
    return await cache.wrap(
      [
        "tutoring:teaching-playbook",
        params.studentUserId,
        params.subjectKey ?? "global",
        params.subjectLabel ?? "global",
      ].join(":"),
      async () =>
        await buildStudentTeachingPlaybookImpl({
          studentUserId: params.studentUserId,
          subjectKey: params.subjectKey ?? null,
          subjectLabel: params.subjectLabel ?? null,
          lessonLocalGaps: [],
          lessonLocalUsedExamples: [],
        }),
      300,
    );
  }

  return await buildStudentTeachingPlaybookImpl(params);
}

async function buildStudentTeachingPlaybookImpl(params: {
  studentUserId: string;
  subjectKey?: string | null;
  subjectLabel?: string | null;
  lessonLocalGaps?: string[];
  lessonLocalUsedExamples?: string[];
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
    lessonLocalGaps: params.lessonLocalGaps ?? [],
    lessonLocalUsedExamples: params.lessonLocalUsedExamples ?? [],
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
