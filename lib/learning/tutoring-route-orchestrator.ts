import { normalizeAppLocale } from "@/lib/i18n/config";
import { getStudentTutoringAccess } from "@/lib/learning/access";
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

export async function resolveStudentTutoringContext(input: {
  userId: string;
  topicId: string;
  language?: string | null;
  preferredLanguage?: string | null;
}) {
  const access = await getStudentTutoringAccess(input.userId, input.topicId);
  const studyLanguage = resolveStudyLanguage(input);

  return { access, studyLanguage };
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
  const requestedSession = input.sessionId
    ? await getLearningSessionById(input.sessionId)
    : null;
  const existing =
    (requestedSession &&
    requestedSession.sessionStatus === "active" &&
    requestedSession.sessionType === "tutoring" &&
    requestedSession.topicId === input.topicId &&
    requestedSession.classroomStudentId === input.access.classroomStudent.id &&
    requestedSession.sessionLocale === input.studyLanguage
      ? requestedSession
      : null) ??
    (await getActiveLearningSession({
      classroomStudentId: input.access.classroomStudent.id,
      topicId: input.topicId,
      sessionType: "tutoring",
      sessionLocale: input.studyLanguage,
    }));

  if (existing) {
    return existing;
  }

  const state = await tutorRuntimeService.initializeSessionState({
    topicId: input.topicId,
    topicTitle: input.access.topic.title,
    sourceBoundary: input.access.topic.sourceBoundary,
    classroomId: input.access.topic.classroomId,
    classroomStudentId: input.access.classroomStudent.id,
    studentUserId: input.access.classroomStudent.userId,
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
