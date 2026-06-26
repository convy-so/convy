import { normalizeAppLocale } from "@/shared/i18n/config";
import {
  getStudentTutoringAccess,
  getStudentTutoringAccessState,
} from "@/features/tutoring/server/access";
import {
  createStudentSession,
  getActiveStudentSession,
  getStudentSessionById,
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

export type StudentLessonAccess = NonNullable<
  Awaited<ReturnType<typeof getStudentTutoringAccess>>
>;
export type StudentTutoringAccessFailureReason =
  (typeof STUDENT_TUTORING_ACCESS_REASON_VALUES)[number];

export async function resolveStudentTutoringContext(input: {
  userId: string;
  lessonId: string;
  language?: string | null;
  preferredLanguage?: string | null;
}) {
  const timer = createTutoringTimer();
  logTutoringDebug("session-context:resolve:start", {
    userId: input.userId,
    lessonId: input.lessonId,
    language: input.language,
    preferredLanguage: input.preferredLanguage,
  });
  const { access, reason } = await measureTutoringStep(
    "session-context:resolve-access",
    {
      userId: input.userId,
      lessonId: input.lessonId,
    },
    async () => await getStudentTutoringAccessState(input.userId, input.lessonId),
  );
  const studyLanguage = resolveStudyLanguage(input);

  logTutoringDebug("session-context:resolve:done", {
    userId: input.userId,
    lessonId: input.lessonId,
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

  return "This tutoring lesson is no longer available in your classroom.";
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
  lessonId: string;
  access: StudentLessonAccess;
  sessionId?: string;
  studyLanguage: string;
}) {
  const timer = createTutoringTimer();
  logTutoringDebug("session:ensure:start", {
    lessonId: input.lessonId,
    classroomStudentId: input.access.classroomStudent.id,
    sessionId: input.sessionId ?? null,
    studyLanguage: input.studyLanguage,
  });
  if (input.sessionId) {
    const sessionId = input.sessionId;
    const requestedSession = await measureTutoringStep(
      "session:ensure:lookup-requested",
      {
        lessonId: input.lessonId,
        sessionId,
        classroomStudentId: input.access.classroomStudent.id,
        studyLanguage: input.studyLanguage,
      },
      async () => await getStudentSessionById(sessionId),
    );

    if (
      requestedSession &&
      requestedSession.sessionStatus === LEARNING_STATUS.sessionActive &&
      requestedSession.sessionType === LEARNING_STATUS.sessionTypeTutoring &&
      requestedSession.lessonId === input.lessonId &&
      requestedSession.classroomStudentId === input.access.classroomStudent.id &&
      requestedSession.sessionLocale === input.studyLanguage
    ) {
      logTutoringDebug("session:ensure:reuse-requested", {
        lessonId: input.lessonId,
        sessionId: requestedSession.id,
        sessionStatus: requestedSession.sessionStatus,
        sessionLocale: requestedSession.sessionLocale,
        durationMs: timer.elapsedMs(),
      });
      return requestedSession;
    }

    logTutoringError("session:ensure:requested-mismatch", new Error("Tutoring session not found."), {
      lessonId: input.lessonId,
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
      lessonId: input.lessonId,
      classroomStudentId: input.access.classroomStudent.id,
      studyLanguage: input.studyLanguage,
    },
    async () =>
      await getActiveStudentSession({
        classroomStudentId: input.access.classroomStudent.id,
        lessonId: input.lessonId,
        sessionType: LEARNING_STATUS.sessionTypeTutoring,
        sessionLocale: input.studyLanguage,
      }),
  );

  if (existing) {
    logTutoringDebug("session:ensure:reuse-active", {
      lessonId: input.lessonId,
      sessionId: existing.id,
      sessionStatus: existing.sessionStatus,
      sessionLocale: existing.sessionLocale,
      durationMs: timer.elapsedMs(),
    });
    return existing;
  }

  logTutoringDebug("session:ensure:create-state", {
    lessonId: input.lessonId,
    classroomStudentId: input.access.classroomStudent.id,
    studyLanguage: input.studyLanguage,
    lessonTitle: input.access.lesson.title,
  });
  const state = await measureTutoringStep(
    "session:ensure:initialize-state",
    {
      lessonId: input.lessonId,
      classroomStudentId: input.access.classroomStudent.id,
      studyLanguage: input.studyLanguage,
    },
    async () =>
      await tutorRuntimeService.initializeSessionState({
        lessonId: input.lessonId,
        lessonTitle: input.access.lesson.title,
        sourceBoundary: input.access.lesson.sourceBoundary,
        studyLanguage: input.studyLanguage,
      }),
  );

  const session = await measureTutoringStep(
    "session:ensure:create-session",
    {
      lessonId: input.lessonId,
      classroomStudentId: input.access.classroomStudent.id,
      studyLanguage: input.studyLanguage,
    },
    async () =>
      await createStudentSession({
        lessonId: input.lessonId,
        classroomStudentId: input.access.classroomStudent.id,
        sessionType: LEARNING_STATUS.sessionTypeTutoring,
        sessionLocale: input.studyLanguage,
        state,
      }),
  );
  logTutoringDebug("session:ensure:created", {
    lessonId: input.lessonId,
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
      lessonId: input.lessonId,
      sessionId: session.id,
      studyLanguage: input.studyLanguage,
    },
    async () =>
      await generateSessionOpening({
        lessonTitle: input.access.lesson.title,
        studyLanguage: input.studyLanguage,
        worldConnection:
          input.access.classroomStudent.interestProfile?.profile.primaryInterests[0]?.label ??
          null,
      }).catch((error) => {
        logTutoringError("session:ensure:opening-generation-failed", error, {
          lessonId: input.lessonId,
          sessionId: session.id,
          durationMs: timer.elapsedMs(),
        });
        return `Let's work on ${input.access.lesson.title}. Start by telling me how you currently think about this lesson.`;
      }),
  );
  logTutoringDebug("session:ensure:opening-ready", {
    lessonId: input.lessonId,
    sessionId: session.id,
    opening: summarizeTutoringText(opening, 180),
    durationMs: timer.elapsedMs(),
  });

  await measureTutoringStep(
    "session:ensure:opening-log",
    {
      lessonId: input.lessonId,
      sessionId: session.id,
      classroomStudentId: input.access.classroomStudent.id,
    },
    async () =>
      await logAssistantTurn({
        sessionId: session.id,
        classroomStudentId: input.access.classroomStudent.id,
        lessonId: input.lessonId,
        content: opening,
        metadata: {
          messageKind: "session_opening",
        },
      }),
  );
  logTutoringDebug("session:ensure:opening-logged", {
    lessonId: input.lessonId,
    sessionId: session.id,
    durationMs: timer.elapsedMs(),
  });

  return session;
}

export async function resolveStudentTutoringSessionById(input: {
  sessionId: string;
  lessonId: string;
  classroomStudentId: string;
}) {
  const timer = createTutoringTimer();
  logTutoringDebug("session:resolve-by-id:start", {
    sessionId: input.sessionId,
    lessonId: input.lessonId,
    classroomStudentId: input.classroomStudentId,
  });
  const tutoringSession = await measureTutoringStep(
    "session:resolve-by-id:lookup",
    {
      sessionId: input.sessionId,
      lessonId: input.lessonId,
      classroomStudentId: input.classroomStudentId,
    },
    async () => await getStudentSessionById(input.sessionId),
  );

  if (!tutoringSession) return null;
  if (tutoringSession.sessionType !== LEARNING_STATUS.sessionTypeTutoring) {
    return null;
  }
  if (tutoringSession.lessonId !== input.lessonId) return null;
  if (tutoringSession.classroomStudentId !== input.classroomStudentId) return null;

  logTutoringDebug("session:resolve-by-id:matched", {
    sessionId: tutoringSession.id,
    lessonId: tutoringSession.lessonId,
    sessionLocale: tutoringSession.sessionLocale,
    sessionStatus: tutoringSession.sessionStatus,
    durationMs: timer.elapsedMs(),
  });

  return tutoringSession;
}

