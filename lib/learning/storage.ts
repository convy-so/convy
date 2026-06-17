import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { unstable_cache } from "next/cache";

import { getDb } from "@/db";
import {
  learningMessages,
  learningSessions,
  learningTopics,
  topicMaterials,
} from "@/db/schema";
import { learningInteractions } from "@/db/schema/learning";
import type {
  LearningInteractionType,
  LearningSessionState,
} from "@/lib/learning/types";
import {
  createDefaultLearningSessionState,
} from "@/lib/learning/types";
import { LearningStateConflictError } from "@/lib/learning/errors";

export async function getTopicWithMaterials(topicId: string) {
  return await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, topicId),
    with: {
      classroom: true,
      course: true,
      materials: {
        orderBy: [asc(topicMaterials.createdAt)],
      },
    },
  });
}

const cachedGetTopicWithMaterials = unstable_cache(
  async (topicId: string) => await getTopicWithMaterials(topicId),
  ["learning-topic-with-materials"],
  { revalidate: 60 },
);

export async function getCachedTopicWithMaterials(topicId: string) {
  return await cachedGetTopicWithMaterials(topicId);
}

export async function createLearningSession(params: {
  topicId?: string | null;
  classroomStudentId: string;
  sessionType: string;
  sessionLocale?: string | null;
  state?: LearningSessionState;
}) {
  const [session] = await getDb()
    .insert(learningSessions)
    .values({
      id: nanoid(),
      topicId: params.topicId ?? null,
      classroomStudentId: params.classroomStudentId,
      sessionType: params.sessionType,
      sessionLocale: params.sessionLocale ?? "en",
      sessionStatus: "active",
      stateVersion: 1,
      state: params.state ?? createDefaultLearningSessionState(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return session;
}

export async function getLearningSessionById(sessionId: string) {
  return await getDb().query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
  });
}

export async function updateLearningSessionState(params: {
  sessionId: string;
  state: LearningSessionState;
  sessionStatus?: string;
  summary?: string | null;
  expectedStateVersion?: number;
}) {
  const completedAt =
    params.sessionStatus === "completed"
      ? new Date()
      : params.sessionStatus && params.sessionStatus !== "completed"
        ? null
        : undefined;

  const [session] = await getDb()
    .update(learningSessions)
    .set({
      state: params.state,
      sessionStatus: params.sessionStatus,
      summary: params.summary,
      completedAt,
      stateVersion:
        params.expectedStateVersion !== undefined
          ? params.expectedStateVersion + 1
          : sql`${learningSessions.stateVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, params.sessionId),
        params.expectedStateVersion !== undefined
          ? eq(learningSessions.stateVersion, params.expectedStateVersion)
          : undefined,
      ),
    )
    .returning();

  if (!session) {
    throw new LearningStateConflictError();
  }

  return session;
}

export async function completeLearningSession(params: {
  sessionId: string;
  summary?: string | null;
  expectedStateVersion?: number;
}) {
  const session = await getLearningSessionById(params.sessionId);
  if (!session) {
    throw new Error("Learning session not found.");
  }

  const state = {
    ...(session.state ?? createDefaultLearningSessionState()),
    completed: true,
    reportReady:
      (session.state ?? createDefaultLearningSessionState()).reportReady ?? false,
  } as LearningSessionState;

  return await updateLearningSessionState({
    sessionId: params.sessionId,
    state,
    sessionStatus: "completed",
    summary: params.summary ?? session.summary ?? null,
    expectedStateVersion: params.expectedStateVersion,
  });
}

export async function getActiveLearningSession(params: {
  classroomStudentId: string;
  topicId?: string | null;
  sessionType: string;
  sessionLocale?: string | null;
}) {
  return await getDb().query.learningSessions.findFirst({
    where:
      params.topicId == null
        ? and(
            eq(learningSessions.classroomStudentId, params.classroomStudentId),
            isNull(learningSessions.topicId),
            eq(learningSessions.sessionType, params.sessionType),
            params.sessionLocale
              ? eq(learningSessions.sessionLocale, params.sessionLocale)
              : undefined,
            eq(learningSessions.sessionStatus, "active"),
          )
        : and(
            eq(learningSessions.classroomStudentId, params.classroomStudentId),
            eq(learningSessions.topicId, params.topicId),
            eq(learningSessions.sessionType, params.sessionType),
            params.sessionLocale
              ? eq(learningSessions.sessionLocale, params.sessionLocale)
              : undefined,
            eq(learningSessions.sessionStatus, "active"),
          ),
    orderBy: [desc(learningSessions.createdAt)],
  });
}

export const getTeachingSessionWithMaterials = getTopicWithMaterials;
export const createTutoringSession = createLearningSession;
export const getTutoringSessionById = getLearningSessionById;
export const updateTutoringSessionState = updateLearningSessionState;
export const completeTutoringSession = completeLearningSession;
export const getActiveTutoringSession = getActiveLearningSession;

export async function getLatestCompletedLearningSession(params: {
  classroomStudentId: string;
  topicId?: string | null;
  sessionType: string;
}) {
  return await getDb().query.learningSessions.findFirst({
    where:
      params.topicId == null
        ? and(
            eq(learningSessions.classroomStudentId, params.classroomStudentId),
            isNull(learningSessions.topicId),
            eq(learningSessions.sessionType, params.sessionType),
            eq(learningSessions.sessionStatus, "completed"),
          )
        : and(
            eq(learningSessions.classroomStudentId, params.classroomStudentId),
            eq(learningSessions.topicId, params.topicId),
            eq(learningSessions.sessionType, params.sessionType),
            eq(learningSessions.sessionStatus, "completed"),
          ),
    orderBy: [desc(learningSessions.completedAt), desc(learningSessions.createdAt)],
  });
}

export async function listLearningMessages(sessionId: string) {
  return await getDb().query.learningMessages.findMany({
    where: eq(learningMessages.sessionId, sessionId),
    orderBy: [asc(learningMessages.createdAt)],
  });
}

export async function getLatestAssistantLearningMessage(sessionId: string) {
  return await getDb().query.learningMessages.findFirst({
    where: and(
      eq(learningMessages.sessionId, sessionId),
      eq(learningMessages.role, "assistant"),
    ),
    orderBy: [desc(learningMessages.createdAt)],
  });
}

export async function appendLearningMessage(params: {
  sessionId: string;
  role: string;
  content: string;
  parts?: Array<Record<string, unknown>> | null;
  metadata?: Record<string, unknown>;
}) {
  const [message] = await getDb()
    .insert(learningMessages)
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
    .update(learningSessions)
    .set({ updatedAt: new Date() })
    .where(eq(learningSessions.id, params.sessionId));

  return message;
}

export async function listLearningInteractions(params: {
  classroomStudentId: string;
  sessionId?: string | null;
}) {
  return await getDb().query.learningInteractions.findMany({
    where: and(
      eq(learningInteractions.classroomStudentId, params.classroomStudentId),
      params.sessionId ? eq(learningInteractions.sessionId, params.sessionId) : undefined,
    ),
    orderBy: [asc(learningInteractions.createdAt)],
  });
}

export async function logLearningInteraction(params: {
  classroomStudentId: string;
  topicId?: string | null;
  sessionId?: string | null;
  role: string;
  interactionType: LearningInteractionType;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const [interaction] = await getDb()
    .insert(learningInteractions)
    .values({
      id: nanoid(),
      classroomStudentId: params.classroomStudentId,
      topicId: params.topicId ?? null,
      sessionId: params.sessionId ?? null,
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

export async function persistTutorTurnOutcome(params: {
  sessionId: string;
  classroomStudentId: string;
  topicId: string;
  assistantText: string;
  assistantParts?: Array<Record<string, unknown>> | null;
  assistantMetadata?: Record<string, unknown>;
  interactionMetadata?: Record<string, unknown>;
  nextState: LearningSessionState;
  expectedStateVersion: number;
}) {
  return await getDb().transaction(async (tx) => {
    await tx.insert(learningMessages).values({
      id: nanoid(),
      sessionId: params.sessionId,
      role: "assistant",
      content: params.assistantText,
      parts: params.assistantParts ?? null,
      metadata: params.assistantMetadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await tx.insert(learningInteractions).values({
      id: nanoid(),
      classroomStudentId: params.classroomStudentId,
      topicId: params.topicId,
      sessionId: params.sessionId,
      role: "assistant",
      interactionType: "tutor_message",
      content: params.assistantText,
      metadata: params.interactionMetadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [session] = await tx
      .update(learningSessions)
      .set({
        state: params.nextState,
        stateVersion: params.expectedStateVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(learningSessions.id, params.sessionId),
          eq(learningSessions.stateVersion, params.expectedStateVersion),
        ),
      )
      .returning();

    if (!session) {
      throw new LearningStateConflictError();
    }

    return session;
  });
}

export {
  createStudentProgressReport,
  getLatestStudentProgressReport,
  upsertInterestProfile,
  markStudentOnboardingComplete,
} from "@/lib/learning/student-profile-storage";

export {
  getCourseFrameworks,
  getFrameworkById,
  getActiveFrameworkForCourse,
  createExpertFrameworkForCourse,
  updateFrameworkDraft,
  activateFramework,
  archiveFramework,
  deleteDraftFramework,
  listApprovedCrystallizations,
  listOpenConflicts,
  getActiveFrameworkBundleForTopic,
} from "@/lib/learning/framework-runtime-storage";

export {
  rebuildTopicGroundingPack,
  buildContentScopeFromPack,
} from "@/lib/learning/topic-grounding-pack-service";
export { renderTopicGroundingPackForPrompt } from "@/lib/learning/topic-grounding-pack-render";

export {
  listExpertReviewCases,
  createExpertReviewCase,
  maybeCreateDraftCrystallizationFromReviewCases,
  listExpertReviewQueue,
} from "@/lib/learning/expert-review-storage";
