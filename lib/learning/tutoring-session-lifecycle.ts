import { getLatestStudentProgressReport, logLearningInteraction, updateLearningSessionState } from "@/lib/learning/storage";
import type { ExpertTutorRuntimeModel, LearningSessionState } from "@/lib/learning/types";
import { enqueueTutoringReportGeneration } from "@/lib/queue";

const FRAMEWORK_COMPLETE_MESSAGE =
  "Tutoring session completed after the framework reached its terminal stage.";
const STUDENT_COMPLETE_MESSAGE = "Tutoring session completed by the student.";


export function shouldRefreshStudentModel(params: {
  previousState: LearningSessionState;
  nextState: LearningSessionState;
  forcedCompletion: boolean;
}) {

  return (
    params.previousState.turnCount === 0 ||
    params.previousState.turnsSinceStudentModelRefresh >= 1 ||
    params.forcedCompletion
  );
}

export function shouldAutoCompleteTutoringSession(params: {
  runtimeModel: ExpertTutorRuntimeModel;
  previousState: LearningSessionState;
  nextState: LearningSessionState;
}) {
  return (
    Boolean(params.runtimeModel.compiledPolicy) &&
    params.nextState.frameworkState.closeRequirementsMet &&
    !params.nextState.frameworkState.assessmentPending &&
    !params.nextState.frameworkState.transferPending &&
    !params.nextState.frameworkState.reflectionPending
  );
}

export async function finalizeTutoringSession(params: {
  sessionId: string;
  topicId: string;
  classroomId: string;
  classroomStudentId: string;
  studentUserId: string;
  studentName: string;
  topicTitle: string;
  sourceLocale?: string | null;
  summary?: string | null;
  expectedStateVersion: number;
  state: LearningSessionState;
  reason: "student_finished" | "framework_complete";
}) {
  const completedState: LearningSessionState = {
    ...params.state,
    completed: true,
    reportReady: false,
  };

  const completedSession = await updateLearningSessionState({
    sessionId: params.sessionId,
    state: completedState,
    sessionStatus: "completed",
    summary: params.summary ?? null,
    expectedStateVersion: params.expectedStateVersion,
  });

  const completionMessage =
    params.reason === "framework_complete"
      ? FRAMEWORK_COMPLETE_MESSAGE
      : STUDENT_COMPLETE_MESSAGE;

  await logLearningInteraction({
    classroomStudentId: params.classroomStudentId,
    topicId: params.topicId,
    sessionId: params.sessionId,
    role: "system",
    interactionType: "session_event",
    content: completionMessage,
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
    sourceLocale: params.sourceLocale ?? "en",
    previousReport:
      previousReport?.generatedFromSessionId === params.sessionId
        ? null
        : previousReport?.report ?? null,
  });

  return completedSession;
}
