import { enqueueTutoringReportGeneration } from "@/lib/queue";
import {
  getLatestStudentProgressReport,
  logLearningInteraction,
  updateLearningSessionState,
} from "@/lib/learning/storage";
import type { LearningSessionState } from "@/lib/learning/types";

const STUDENT_COMPLETE_MESSAGE = "Tutoring session completed by the student.";
const TUTOR_COMPLETE_MESSAGE = "Tutoring session completed by the tutor.";

export async function finalizeTutoringSession(params: {
  sessionId: string;
  topicId: string;
  classroomId: string;
  classroomStudentId: string;
  studentUserId: string;
  studentName: string;
  topicTitle: string;
  courseId?: string | null;
  courseTitle?: string | null;
  sourceLocale?: string | null;
  summary?: string | null;
  expectedStateVersion: number;
  state: LearningSessionState;
  reason: "student_finished" | "tutor_finished";
}) {
  const completedState: LearningSessionState = {
    ...params.state,
    completed: true,
    reportReady: false,
    completionRequestedAt: new Date().toISOString(),
  };

  const completedSession = await updateLearningSessionState({
    sessionId: params.sessionId,
    state: completedState,
    sessionStatus: "completed",
    summary: params.summary ?? null,
    expectedStateVersion: params.expectedStateVersion,
  });

  await logLearningInteraction({
    classroomStudentId: params.classroomStudentId,
    topicId: params.topicId,
    sessionId: params.sessionId,
    role: "system",
    interactionType: "session_event",
    content:
      params.reason === "tutor_finished"
        ? TUTOR_COMPLETE_MESSAGE
        : STUDENT_COMPLETE_MESSAGE,
    metadata: {
      reason: params.reason,
    },
  });

  const previousReport = await getLatestStudentProgressReport({
    topicId: params.topicId,
    classroomStudentId: params.classroomStudentId,
  });

  await enqueueTutoringReportGeneration({
    sessionId: params.sessionId,
    topicId: params.topicId,
    classroomId: params.classroomId,
    studentUserId: params.studentUserId,
    classroomStudentId: params.classroomStudentId,
    studentName: params.studentName,
    topicTitle: params.topicTitle,
    courseId: params.courseId ?? null,
    courseTitle: params.courseTitle ?? null,
    sourceLocale: params.sourceLocale ?? "en",
    previousReport:
      previousReport?.generatedFromSessionId === params.sessionId
        ? null
        : previousReport?.report ?? null,
  });

  return completedSession;
}
