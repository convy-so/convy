import { normalizeAppLocale } from "@/lib/i18n/config";
import {
  getStudentTutoringAccess,
  getStudentTutoringAccessState,
} from "@/lib/learning/access";
import {
  createLearningSession,
  getActiveLearningSession,
  getLearningSessionById,
} from "@/lib/learning/storage";
import { logAssistantTurn } from "@/lib/learning/tutoring-turn-logging";
import { tutorRuntimeService } from "@/lib/learning/tutor-runtime-service";
import { generateSessionOpening } from "@/lib/learning/tutor";

export type StudentTopicAccess = NonNullable<
  Awaited<ReturnType<typeof getStudentTutoringAccess>>
>;
export type StudentTutoringAccessFailureReason =
  | "topic_unavailable"
  | "interest_profile_required";

export async function resolveStudentTutoringContext(input: {
  userId: string;
  topicId: string;
  language?: string | null;
  preferredLanguage?: string | null;
}) {
  const { access, reason } = await getStudentTutoringAccessState(
    input.userId,
    input.topicId,
  );
  const studyLanguage = resolveStudyLanguage(input);

  return { access, deniedReason: reason, studyLanguage };
}

export function getStudentTutoringAccessFailureMessage(
  reason: StudentTutoringAccessFailureReason,
) {
  if (reason === "interest_profile_required") {
    return "Complete your interest profile before starting this tutoring session.";
  }

  return "This tutoring topic is no longer available in your classroom.";
}

export function resolveStudyLanguage(input: {
  language?: string | null;
  preferredLanguage?: string | null;
}) {
  return normalizeAppLocale(
    input.language ?? input.preferredLanguage ?? "en",
  );
}

export async function ensureTutoringSession(input: {
  topicId: string;
  access: StudentTopicAccess;
  sessionId?: string;
  studyLanguage: string;
}) {
  if (input.sessionId) {
    const requestedSession = await getLearningSessionById(input.sessionId);

    if (
      requestedSession &&
      requestedSession.sessionStatus === "active" &&
      requestedSession.sessionType === "tutoring" &&
      requestedSession.topicId === input.topicId &&
      requestedSession.classroomStudentId === input.access.classroomStudent.id &&
      requestedSession.sessionLocale === input.studyLanguage
    ) {
      return requestedSession;
    }

    throw new Error("Tutoring session not found.");
  }

  const existing = await getActiveLearningSession({
    classroomStudentId: input.access.classroomStudent.id,
    topicId: input.topicId,
    sessionType: "tutoring",
    sessionLocale: input.studyLanguage,
  });

  if (existing) {
    return existing;
  }

  const state = await tutorRuntimeService.initializeSessionState({
    topicId: input.topicId,
    topicTitle: input.access.topic.title,
    sourceBoundary: input.access.topic.sourceBoundary,
    studyLanguage: input.studyLanguage,
  });

  const session = await createLearningSession({
    topicId: input.topicId,
    classroomStudentId: input.access.classroomStudent.id,
    sessionType: "tutoring",
    sessionLocale: input.studyLanguage,
    state,
  });

  const opening = await generateSessionOpening({
    topicTitle: input.access.topic.title,
    studyLanguage: input.studyLanguage,
    worldConnection:
      input.access.classroomStudent.interestProfile?.profile.primaryInterests[0]?.label ??
      null,
  }).catch(
    () =>
      `Let's work on ${input.access.topic.title}. Start by telling me how you currently think about this topic.`,
  );

  await logAssistantTurn({
    sessionId: session.id,
    classroomStudentId: input.access.classroomStudent.id,
    topicId: input.topicId,
    content: opening,
    metadata: {
      messageKind: "session_opening",
    },
  });

  return session;
}

export async function resolveStudentTutoringSessionById(input: {
  sessionId: string;
  topicId: string;
  classroomStudentId: string;
}) {
  const tutoringSession = await getLearningSessionById(input.sessionId);

  if (!tutoringSession) return null;
  if (tutoringSession.sessionType !== "tutoring") return null;
  if (tutoringSession.topicId !== input.topicId) return null;
  if (tutoringSession.classroomStudentId !== input.classroomStudentId) return null;

  return tutoringSession;
}
