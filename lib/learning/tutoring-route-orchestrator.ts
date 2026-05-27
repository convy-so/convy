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
import {
  logTutoringDebug,
  logTutoringError,
  summarizeTutoringText,
} from "@/lib/learning/tutoring-debug";

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
  logTutoringDebug("session-context:resolve:start", {
    userId: input.userId,
    topicId: input.topicId,
    language: input.language,
    preferredLanguage: input.preferredLanguage,
  });
  const { access, reason } = await getStudentTutoringAccessState(
    input.userId,
    input.topicId,
  );
  const studyLanguage = resolveStudyLanguage(input);

  logTutoringDebug("session-context:resolve:done", {
    userId: input.userId,
    topicId: input.topicId,
    hasAccess: Boolean(access),
    deniedReason: reason ?? null,
    studyLanguage,
  });

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
  logTutoringDebug("session:ensure:start", {
    topicId: input.topicId,
    classroomStudentId: input.access.classroomStudent.id,
    sessionId: input.sessionId ?? null,
    studyLanguage: input.studyLanguage,
  });
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
      logTutoringDebug("session:ensure:reuse-requested", {
        topicId: input.topicId,
        sessionId: requestedSession.id,
        sessionStatus: requestedSession.sessionStatus,
        sessionLocale: requestedSession.sessionLocale,
      });
      return requestedSession;
    }

    logTutoringError("session:ensure:requested-mismatch", new Error("Tutoring session not found."), {
      topicId: input.topicId,
      sessionId: input.sessionId,
      classroomStudentId: input.access.classroomStudent.id,
      studyLanguage: input.studyLanguage,
    });
    throw new Error("Tutoring session not found.");
  }

  const existing = await getActiveLearningSession({
    classroomStudentId: input.access.classroomStudent.id,
    topicId: input.topicId,
    sessionType: "tutoring",
    sessionLocale: input.studyLanguage,
  });

  if (existing) {
    logTutoringDebug("session:ensure:reuse-active", {
      topicId: input.topicId,
      sessionId: existing.id,
      sessionStatus: existing.sessionStatus,
      sessionLocale: existing.sessionLocale,
    });
    return existing;
  }

  logTutoringDebug("session:ensure:create-state", {
    topicId: input.topicId,
    classroomStudentId: input.access.classroomStudent.id,
    studyLanguage: input.studyLanguage,
    topicTitle: input.access.topic.title,
  });
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
  logTutoringDebug("session:ensure:created", {
    topicId: input.topicId,
    sessionId: session.id,
    sessionLocale: session.sessionLocale,
    stateVersion: session.stateVersion,
    contentScopeVersion: state.groundingPackVersion,
    frameworkVersionId: state.frameworkVersionId,
  });

  const opening = await generateSessionOpening({
    topicTitle: input.access.topic.title,
    studyLanguage: input.studyLanguage,
    worldConnection:
      input.access.classroomStudent.interestProfile?.profile.primaryInterests[0]?.label ??
      null,
  }).catch((error) => {
    logTutoringError("session:ensure:opening-generation-failed", error, {
      topicId: input.topicId,
      sessionId: session.id,
    });
    return `Let's work on ${input.access.topic.title}. Start by telling me how you currently think about this topic.`;
  });
  logTutoringDebug("session:ensure:opening-ready", {
    topicId: input.topicId,
    sessionId: session.id,
    opening: summarizeTutoringText(opening, 180),
  });

  await logAssistantTurn({
    sessionId: session.id,
    classroomStudentId: input.access.classroomStudent.id,
    topicId: input.topicId,
    content: opening,
    metadata: {
      messageKind: "session_opening",
    },
  });
  logTutoringDebug("session:ensure:opening-logged", {
    topicId: input.topicId,
    sessionId: session.id,
  });

  return session;
}

export async function resolveStudentTutoringSessionById(input: {
  sessionId: string;
  topicId: string;
  classroomStudentId: string;
}) {
  logTutoringDebug("session:resolve-by-id:start", {
    sessionId: input.sessionId,
    topicId: input.topicId,
    classroomStudentId: input.classroomStudentId,
  });
  const tutoringSession = await getLearningSessionById(input.sessionId);

  if (!tutoringSession) return null;
  if (tutoringSession.sessionType !== "tutoring") return null;
  if (tutoringSession.topicId !== input.topicId) return null;
  if (tutoringSession.classroomStudentId !== input.classroomStudentId) return null;

  logTutoringDebug("session:resolve-by-id:matched", {
    sessionId: tutoringSession.id,
    topicId: tutoringSession.topicId,
    sessionLocale: tutoringSession.sessionLocale,
    sessionStatus: tutoringSession.sessionStatus,
  });

  return tutoringSession;
}
