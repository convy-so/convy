import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { cache } from "@/shared/infra/cache";
import {
  studentSessionMessages,
  studentSessions,
  lessons,
  lessonMaterials,
} from "@/shared/db/schema";
import { studentInteractions } from "@/shared/db/schema/tutoring";
import type { StudentInteractionType } from "@/features/tutoring/server/lesson-foundation-schemas";
import {
  createDefaultStudentSessionState,
  type StudentSessionState,
} from "@/features/tutoring/server/student-session-schemas";
import { StudentSessionStateConflictError } from "@/features/tutoring/server/student-session-state-errors";
import {
  TUTORING_DEFAULTS,
  TUTORING_NUMERIC_DEFAULTS,
  TUTORING_STATUS,
} from "@/shared/tutoring/constants";
import { requireValue } from "@/shared/utils/collections";

export async function getLessonWithMaterials(lessonId: string) {
  return await getDb().query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
    with: {
      classroom: true,
      course: true,
      materials: {
        orderBy: [asc(lessonMaterials.createdAt)],
      },
    },
  });
}

export async function getCachedLessonWithMaterials(lessonId: string) {
  return await cache.wrap(
    `tutoring:lesson-with-materials:${lessonId}`,
    async () => await getLessonWithMaterials(lessonId),
    60,
  );
}

export async function createStudentSession(params: {
  lessonId?: string | null;
  classroomStudentId: string;
  sessionType: string;
  sessionLocale?: string | null;
  state?: StudentSessionState;
}) {
  const [session] = await getDb()
    .insert(studentSessions)
    .values({
      id: nanoid(),
      lessonId: params.lessonId ?? null,
      classroomStudentId: params.classroomStudentId,
      sessionType: params.sessionType,
      sessionLocale: params.sessionLocale ?? TUTORING_DEFAULTS.sessionLocale,
      sessionStatus: TUTORING_STATUS.sessionActive,
      stateVersion: TUTORING_NUMERIC_DEFAULTS.initialVersion,
      state: params.state ?? createDefaultStudentSessionState(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return requireValue(session, "Failed to create student session.");
}

export async function getStudentSessionById(sessionId: string) {
  return await getDb().query.studentSessions.findFirst({
    where: eq(studentSessions.id, sessionId),
  });
}

export async function updateStudentSessionState(params: {
  sessionId: string;
  state: StudentSessionState;
  sessionStatus?: string;
  summary?: string | null;
  expectedStateVersion?: number;
}) {
  const completedAt =
    params.sessionStatus === TUTORING_STATUS.sessionCompleted
      ? new Date()
      : params.sessionStatus &&
          params.sessionStatus !== TUTORING_STATUS.sessionCompleted
        ? null
        : undefined;

  const [session] = await getDb()
    .update(studentSessions)
    .set({
      state: params.state,
      sessionStatus: params.sessionStatus,
      summary: params.summary,
      completedAt,
      stateVersion:
        params.expectedStateVersion !== undefined
          ? params.expectedStateVersion + 1
          : sql`${studentSessions.stateVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(studentSessions.id, params.sessionId),
        params.expectedStateVersion !== undefined
          ? eq(studentSessions.stateVersion, params.expectedStateVersion)
          : undefined,
      ),
    )
    .returning();

  if (!session) {
    throw new StudentSessionStateConflictError();
  }

  return session;
}

export async function completeStudentSession(params: {
  sessionId: string;
  summary?: string | null;
  expectedStateVersion?: number;
}) {
  const session = await getStudentSessionById(params.sessionId);
  if (!session) {
    throw new Error("Student session not found.");
  }

  const state = {
    ...(session.state ?? createDefaultStudentSessionState()),
    completed: true,
    reportReady:
      (session.state ?? createDefaultStudentSessionState()).reportReady ?? false,
  } as StudentSessionState;

  return await updateStudentSessionState({
    sessionId: params.sessionId,
    state,
    sessionStatus: TUTORING_STATUS.sessionCompleted,
    summary: params.summary ?? session.summary ?? null,
    expectedStateVersion: params.expectedStateVersion,
  });
}

export async function getActiveStudentSession(params: {
  classroomStudentId: string;
  lessonId?: string | null;
  sessionType: string;
  sessionLocale?: string | null;
}) {
  return await getDb().query.studentSessions.findFirst({
    where:
      params.lessonId == null
        ? and(
            eq(studentSessions.classroomStudentId, params.classroomStudentId),
            isNull(studentSessions.lessonId),
            eq(studentSessions.sessionType, params.sessionType),
            params.sessionLocale
              ? eq(studentSessions.sessionLocale, params.sessionLocale)
              : undefined,
            eq(studentSessions.sessionStatus, TUTORING_STATUS.sessionActive),
          )
        : and(
            eq(studentSessions.classroomStudentId, params.classroomStudentId),
            eq(studentSessions.lessonId, params.lessonId),
            eq(studentSessions.sessionType, params.sessionType),
            params.sessionLocale
              ? eq(studentSessions.sessionLocale, params.sessionLocale)
              : undefined,
            eq(studentSessions.sessionStatus, TUTORING_STATUS.sessionActive),
          ),
    orderBy: [desc(studentSessions.createdAt)],
  });
}

export const getTeachingSessionWithMaterials = getLessonWithMaterials;
export const createTutoringSession = createStudentSession;
export const getTutoringSessionById = getStudentSessionById;
export const updateTutoringSessionState = updateStudentSessionState;
export const completeTutoringSession = completeStudentSession;
export const getActiveTutoringSession = getActiveStudentSession;

export async function getLatestCompletedStudentSession(params: {
  classroomStudentId: string;
  lessonId?: string | null;
  sessionType: string;
}) {
  return await getDb().query.studentSessions.findFirst({
    where:
      params.lessonId == null
        ? and(
            eq(studentSessions.classroomStudentId, params.classroomStudentId),
            isNull(studentSessions.lessonId),
            eq(studentSessions.sessionType, params.sessionType),
            eq(studentSessions.sessionStatus, TUTORING_STATUS.sessionCompleted),
          )
        : and(
            eq(studentSessions.classroomStudentId, params.classroomStudentId),
            eq(studentSessions.lessonId, params.lessonId),
            eq(studentSessions.sessionType, params.sessionType),
            eq(studentSessions.sessionStatus, TUTORING_STATUS.sessionCompleted),
          ),
    orderBy: [desc(studentSessions.completedAt), desc(studentSessions.createdAt)],
  });
}

export async function listStudentSessionMessages(sessionId: string) {
  return await getDb().query.studentSessionMessages.findMany({
    where: eq(studentSessionMessages.sessionId, sessionId),
    orderBy: [asc(studentSessionMessages.createdAt)],
  });
}

export async function getLatestAssistantStudentMessage(sessionId: string) {
  return await getDb().query.studentSessionMessages.findFirst({
    where: and(
      eq(studentSessionMessages.sessionId, sessionId),
      eq(studentSessionMessages.role, "assistant"),
    ),
    orderBy: [desc(studentSessionMessages.createdAt)],
  });
}

export async function appendStudentMessage(params: {
  sessionId: string;
  role: string;
  content: string;
  parts?: Array<Record<string, unknown>> | null;
  metadata?: Record<string, unknown>;
}) {
  const [message] = await getDb()
    .insert(studentSessionMessages)
    .values({
      id: nanoid(),
      sessionId: params.sessionId,
      role: params.role,
      content: params.content,
      parts: params.parts ?? null,
      metadata: params.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await getDb()
    .update(studentSessions)
    .set({ updatedAt: new Date() })
    .where(eq(studentSessions.id, params.sessionId));

  return message;
}

export async function listStudentInteractions(params: {
  classroomStudentId: string;
  sessionId?: string | null;
}) {
  return await getDb().query.studentInteractions.findMany({
    where: and(
      eq(studentInteractions.classroomStudentId, params.classroomStudentId),
      params.sessionId ? eq(studentInteractions.sessionId, params.sessionId) : undefined,
    ),
    orderBy: [asc(studentInteractions.createdAt)],
  });
}

export async function appendStudentInteraction(params: {
  classroomStudentId: string;
  sessionId?: string | null;
  lessonId?: string | null;
  role: string;
  interactionType: StudentInteractionType;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const [interaction] = await getDb()
    .insert(studentInteractions)
    .values({
      id: nanoid(),
      classroomStudentId: params.classroomStudentId,
      sessionId: params.sessionId ?? null,
      lessonId: params.lessonId ?? null,
      role: params.role,
      interactionType: params.interactionType,
      content: params.content,
      metadata: params.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return interaction;
}

export async function logStudentInteraction(params: {
  classroomStudentId: string;
  sessionId?: string | null;
  lessonId?: string | null;
  role: string;
  interactionType: StudentInteractionType;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  return await appendStudentInteraction(params);
}

export async function persistTutorTurnOutcome(params: {
  sessionId: string;
  classroomStudentId: string;
  lessonId: string;
  assistantText: string;
  assistantParts?: Array<Record<string, unknown>> | null;
  assistantMetadata?: Record<string, unknown>;
  interactionMetadata?: Record<string, unknown>;
  nextState: StudentSessionState;
  expectedStateVersion: number;
}) {
  await appendStudentMessage({
    sessionId: params.sessionId,
    role: "assistant",
    content: params.assistantText,
    parts: params.assistantParts ?? null,
    metadata: params.assistantMetadata ?? {},
  });

  await logStudentInteraction({
    classroomStudentId: params.classroomStudentId,
    lessonId: params.lessonId,
    sessionId: params.sessionId,
    role: "assistant",
    interactionType: "tutor_message",
    content: params.assistantText,
    metadata: params.interactionMetadata ?? {},
  });

  return await updateStudentSessionState({
    sessionId: params.sessionId,
    state: params.nextState,
    expectedStateVersion: params.expectedStateVersion,
  });
}


