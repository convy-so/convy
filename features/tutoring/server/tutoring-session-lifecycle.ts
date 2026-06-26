import { enqueueTutoringReportGeneration } from "@/shared/infra/queue";
import {
  getLatestStudentProgressReport,
  logStudentInteraction,
  updateStudentSessionState,
} from "@/features/tutoring/public-server";
import type { StudentSessionState } from "@/features/tutoring/public-server";
import {
  LEARNING_DEFAULT_LOCALE,
  LEARNING_STATUS,
  TUTORING_COMPLETION_REASON,
  TUTORING_COMPLETION_REASON_VALUES,
} from "@/shared/learning/constants";

const STUDENT_COMPLETE_MESSAGE = "Tutoring session completed by the student.";
const TUTOR_COMPLETE_MESSAGE = "Tutoring session completed by the tutor.";

export async function finalizeTutoringSession(params: {
  sessionId: string;
  lessonId: string;
  classroomId: string;
  classroomStudentId: string;
  studentUserId: string;
  studentName: string;
  lessonTitle: string;
  courseId?: string | null;
  courseTitle?: string | null;
  sourceLocale?: string | null;
  summary?: string | null;
  expectedStateVersion: number;
  state: StudentSessionState;
  reason: (typeof TUTORING_COMPLETION_REASON_VALUES)[number];
}) {
  const completedState: StudentSessionState = {
    ...params.state,
    completed: true,
    reportReady: false,
    completionRequestedAt: new Date().toISOString(),
  };

  const completedSession = await updateStudentSessionState({
    sessionId: params.sessionId,
    state: completedState,
    sessionStatus: LEARNING_STATUS.sessionCompleted,
    summary: params.summary ?? null,
    expectedStateVersion: params.expectedStateVersion,
  });

  await logStudentInteraction({
    classroomStudentId: params.classroomStudentId,
    lessonId: params.lessonId,
    sessionId: params.sessionId,
    role: "system",
    interactionType: "session_event",
    content:
      params.reason === TUTORING_COMPLETION_REASON.TUTOR_FINISHED
        ? TUTOR_COMPLETE_MESSAGE
        : STUDENT_COMPLETE_MESSAGE,
    metadata: {
      reason: params.reason,
    },
  });

  const previousReport = await getLatestStudentProgressReport({
    lessonId: params.lessonId,
    classroomStudentId: params.classroomStudentId,
  });

  await enqueueTutoringReportGeneration({
    sessionId: params.sessionId,
    lessonId: params.lessonId,
    classroomId: params.classroomId,
    studentUserId: params.studentUserId,
    classroomStudentId: params.classroomStudentId,
    studentName: params.studentName,
    lessonTitle: params.lessonTitle,
    courseId: params.courseId ?? null,
    courseTitle: params.courseTitle ?? null,
    sourceLocale: params.sourceLocale ?? LEARNING_DEFAULT_LOCALE,
    previousReport:
      previousReport?.generatedFromSessionId === params.sessionId
        ? null
        : previousReport?.report ?? null,
  });

  return completedSession;
}

