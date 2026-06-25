import { normalizeAppLocale } from "@/shared/i18n/config";
import {
  getStudentTutoringAccess,
  getStudentTutoringAccessState,
} from "@/features/tutoring/server/access";
import {
  createLearningSession,
  getActiveLearningSession,
  getLearningSessionById,
} from "@/features/tutoring/public-server";
import { logAssistantTurn } from "@/features/tutoring/server/tutoring-turn-logging";
import { tutorRuntimeService } from "@/features/tutoring/server/tutor-runtime-service";
import { generateSessionOpening } from "@/features/tutoring/server/tutor";
import {
  logTutoringDebug,
  logTutoringError,
  summarizeTutoringText,
  createTutoringTimer,
  measureTutoringStep,
} from "@/features/tutoring/public-server";
import {
  LEARNING_DEFAULT_LOCALE,
  LEARNING_STATUS,
  STUDENT_TUTORING_ACCESS_REASON,
  STUDENT_TUTORING_ACCESS_REASON_VALUES,
} from "@/shared/learning/constants";

export type StudentTopicAccess = NonNullable<
  Awaited<ReturnType<typeof getStudentTutoringAccess>>
>;
export type StudentTutoringAccessFailureReason =
  (typeof STUDENT_TUTORING_ACCESS_REASON_VALUES)[number];

export async function resolveStudentTutoringContext(input: {
  userId: string;
  topicId: string;
  language?: string | null;
  preferredLanguage?: string | null;
}) {
  const timer = createTutoringTimer();
  logTutoringDebug("session-context:resolve:start", {
    userId: input.userId,
    topicId: input.topicId,
    language: input.language,
    preferredLanguage: input.preferredLanguage,
  });
  const { access, reason } = await measureTutoringStep(
    "session-context:resolve-access",
    {
      userId: input.userId,
      topicId: input.topicId,
    },
    async () => await getStudentTutoringAccessState(input.userId, input.topicId),
  );
  const studyLanguage = resolveStudyLanguage(input);

  logTutoringDebug("session-context:resolve:done", {
    userId: input.userId,
    topicId: input.topicId,
    hasAccess: Boolean(access),
    deniedReason: reason ?? null,
    studyLanguage,
    durationMs: timer.elapsedMs(),
  });

  return { access, deniedReason: reason, studyLanguage };
}

export function getStudentTutoringAccessFailureMessage(
  reason: StudentTutoringAccessFailureReason,
) {
  if (reason === STUDENT_TUTORING_ACCESS_REASON.INTEREST_PROFILE_REQUIRED) {
    return "Complete your interest profile before starting this tutoring session.";
  }

  return "This tutoring topic is no longer available in your classroom.";
}

export function resolveStudyLanguage(input: {
  language?: string | null;
  preferredLanguage?: string | null;
}) {
  return normalizeAppLocale(
    input.language ?? input.preferredLanguage ?? LEARNING_DEFAULT_LOCALE,
  );
}

export async function ensureTutoringSession(input: {
  topicId: string;
  access: StudentTopicAccess;
  sessionId?: string;
  studyLanguage: string;
}) {
  const timer = createTutoringTimer();
  logTutoringDebug("session:ensure:start", {
    topicId: input.topicId,
    classroomStudentId: input.access.classroomStudent.id,
    sessionId: input.sessionId ?? null,
    studyLanguage: input.studyLanguage,
  });
  if (input.sessionId) {
    const sessionId = input.sessionId;
    const requestedSession = await measureTutoringStep(
      "session:ensure:lookup-requested",
      {
        topicId: input.topicId,
        sessionId,
        classroomStudentId: input.access.classroomStudent.id,
        studyLanguage: input.studyLanguage,
      },
      async () => await getLearningSessionById(sessionId),
    );

    if (
      requestedSession &&
      requestedSession.sessionStatus === LEARNING_STATUS.sessionActive &&
      requestedSession.sessionType === LEARNING_STATUS.sessionTypeTutoring &&
      requestedSession.topicId === input.topicId &&
      requestedSession.classroomStudentId === input.access.classroomStudent.id &&
      requestedSession.sessionLocale === input.studyLanguage
    ) {
      logTutoringDebug("session:ensure:reuse-requested", {
        topicId: input.topicId,
        sessionId: requestedSession.id,
        sessionStatus: requestedSession.sessionStatus,
        sessionLocale: requestedSession.sessionLocale,
        durationMs: timer.elapsedMs(),
      });
      return requestedSession;
    }

    logTutoringError("session:ensure:requested-mismatch", new Error("Tutoring session not found."), {
      topicId: input.topicId,
      sessionId: input.sessionId,
      classroomStudentId: input.access.classroomStudent.id,
      studyLanguage: input.studyLanguage,
      durationMs: timer.elapsedMs(),
    });
    throw new Error("Tutoring session not found.");
  }

  const existing = await measureTutoringStep(
    "session:ensure:lookup-active",
    {
      topicId: input.topicId,
      classroomStudentId: input.access.classroomStudent.id,
      studyLanguage: input.studyLanguage,
    },
    async () =>
      await getActiveLearningSession({
        classroomStudentId: input.access.classroomStudent.id,
        topicId: input.topicId,
        sessionType: LEARNING_STATUS.sessionTypeTutoring,
        sessionLocale: input.studyLanguage,
      }),
  );

  if (existing) {
    logTutoringDebug("session:ensure:reuse-active", {
      topicId: input.topicId,
      sessionId: existing.id,
      sessionStatus: existing.sessionStatus,
      sessionLocale: existing.sessionLocale,
      durationMs: timer.elapsedMs(),
    });
    return existing;
  }

  logTutoringDebug("session:ensure:create-state", {
    topicId: input.topicId,
    classroomStudentId: input.access.classroomStudent.id,
    studyLanguage: input.studyLanguage,
    topicTitle: input.access.topic.title,
  });
  const state = await measureTutoringStep(
    "session:ensure:initialize-state",
    {
      topicId: input.topicId,
      classroomStudentId: input.access.classroomStudent.id,
      studyLanguage: input.studyLanguage,
    },
    async () =>
      await tutorRuntimeService.initializeSessionState({
        topicId: input.topicId,
        topicTitle: input.access.topic.title,
        sourceBoundary: input.access.topic.sourceBoundary,
        studyLanguage: input.studyLanguage,
      }),
  );

  const session = await measureTutoringStep(
    "session:ensure:create-session",
    {
      topicId: input.topicId,
      classroomStudentId: input.access.classroomStudent.id,
      studyLanguage: input.studyLanguage,
    },
    async () =>
      await createLearningSession({
        topicId: input.topicId,
        classroomStudentId: input.access.classroomStudent.id,
        sessionType: LEARNING_STATUS.sessionTypeTutoring,
        sessionLocale: input.studyLanguage,
        state,
      }),
  );
  logTutoringDebug("session:ensure:created", {
    topicId: input.topicId,
    sessionId: session.id,
    sessionLocale: session.sessionLocale,
    stateVersion: session.stateVersion,
    contentScopeVersion: state.groundingPackVersion,
    frameworkId: state.frameworkId,
    durationMs: timer.elapsedMs(),
  });

  const opening = await measureTutoringStep(
    "session:ensure:generate-opening",
    {
      topicId: input.topicId,
      sessionId: session.id,
      studyLanguage: input.studyLanguage,
    },
    async () =>
      await generateSessionOpening({
        topicTitle: input.access.topic.title,
        studyLanguage: input.studyLanguage,
        worldConnection:
          input.access.classroomStudent.interestProfile?.profile.primaryInterests[0]?.label ??
          null,
      }).catch((error) => {
        logTutoringError("session:ensure:opening-generation-failed", error, {
          topicId: input.topicId,
          sessionId: session.id,
          durationMs: timer.elapsedMs(),
        });
        return `Let's work on ${input.access.topic.title}. Start by telling me how you currently think about this topic.`;
      }),
  );
  logTutoringDebug("session:ensure:opening-ready", {
    topicId: input.topicId,
    sessionId: session.id,
    opening: summarizeTutoringText(opening, 180),
    durationMs: timer.elapsedMs(),
  });

  await measureTutoringStep(
    "session:ensure:opening-log",
    {
      topicId: input.topicId,
      sessionId: session.id,
      classroomStudentId: input.access.classroomStudent.id,
    },
    async () =>
      await logAssistantTurn({
        sessionId: session.id,
        classroomStudentId: input.access.classroomStudent.id,
        topicId: input.topicId,
        content: opening,
        metadata: {
          messageKind: "session_opening",
        },
      }),
  );
  logTutoringDebug("session:ensure:opening-logged", {
    topicId: input.topicId,
    sessionId: session.id,
    durationMs: timer.elapsedMs(),
  });

  return session;
}

export async function resolveStudentTutoringSessionById(input: {
  sessionId: string;
  topicId: string;
  classroomStudentId: string;
}) {
  const timer = createTutoringTimer();
  logTutoringDebug("session:resolve-by-id:start", {
    sessionId: input.sessionId,
    topicId: input.topicId,
    classroomStudentId: input.classroomStudentId,
  });
  const tutoringSession = await measureTutoringStep(
    "session:resolve-by-id:lookup",
    {
      sessionId: input.sessionId,
      topicId: input.topicId,
      classroomStudentId: input.classroomStudentId,
    },
    async () => await getLearningSessionById(input.sessionId),
  );

  if (!tutoringSession) return null;
  if (tutoringSession.sessionType !== LEARNING_STATUS.sessionTypeTutoring) {
    return null;
  }
  if (tutoringSession.topicId !== input.topicId) return null;
  if (tutoringSession.classroomStudentId !== input.classroomStudentId) return null;

  logTutoringDebug("session:resolve-by-id:matched", {
    sessionId: tutoringSession.id,
    topicId: tutoringSession.topicId,
    sessionLocale: tutoringSession.sessionLocale,
    sessionStatus: tutoringSession.sessionStatus,
    durationMs: timer.elapsedMs(),
  });

  return tutoringSession;
}
