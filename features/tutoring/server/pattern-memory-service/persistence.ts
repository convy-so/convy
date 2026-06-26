import {
  analyzeOnboardingLearningPatterns,
  analyzeSessionLearningPatterns,
  deriveSubjectInfo,
} from "@/features/tutoring/server/patterns";
import type {
  StudentSessionState,
  StudentInterestProfile,
  TeacherProgressReport,
} from "@/features/tutoring/public-server";

import { safelyAddObservations } from "./model";
import { summarizeStudentPatternMemory } from "./summarize";

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
            subjectLabel: null,
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
  lessonId: string;
  lessonTitle: string;
  subjectKey?: string | null;
  subjectLabel?: string | null;
  sessionId: string;
  interestProfile: StudentInterestProfile;
  state: StudentSessionState;
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
    lessonTitle: params.lessonTitle,
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
    lessonId: params.lessonId,
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

