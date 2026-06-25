import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { learningTopics } from "@/shared/db/schema";
import {
  LEARNING_LIMITS,
  LEARNING_STATUS,
} from "@/shared/learning/constants";
import { getCourseById } from "@/features/tutoring/server/course-service";
import {
  learningOutcomeDefinitionSchema,
  topicSourceBoundarySchema,
  type LearningOutcomeDefinition,
  type TopicSourceBoundary,
} from "@/features/tutoring/public-server";
import { requireValue } from "@/shared/utils/collections";

function normalizeLearningOutcome(
  outcome: LearningOutcomeDefinition,
  index: number,
): LearningOutcomeDefinition {
  return learningOutcomeDefinitionSchema.parse({
    id: outcome.id || `outcome-${index + 1}`,
    title: outcome.title,
    description: outcome.description,
    evidenceSignals: outcome.evidenceSignals ?? [],
    masteryThreshold:
      outcome.masteryThreshold ?? LEARNING_LIMITS.defaultLearningOutcomeMasteryThreshold,
    misconceptionTags: outcome.misconceptionTags ?? [],
  });
}

/**
 * Create a new learning topic with outcomes and source boundaries
 */
export async function createLearningTopic(params: {
  classroomId: string;
  createdByUserId: string;
  title: string;
  description?: string;
  courseId: string;
  contentLocale: "en" | "fr" | "de";
  learningOutcomes?: LearningOutcomeDefinition[];
  sourceBoundary?: Partial<TopicSourceBoundary>;
}) {
  const topicId = nanoid();
  const now = new Date();

  const learningOutcomes = (params.learningOutcomes ?? []).map((outcome, index) =>
    normalizeLearningOutcome(outcome, index),
  );

  const sourceBoundary = topicSourceBoundarySchema.parse({
    ...params.sourceBoundary,
    teacherSummary: params.sourceBoundary?.teacherSummary ?? params.description ?? "",
  });
  const course = await getCourseById(params.courseId);

  if (!course) {
    throw new Error("Course not found");
  }

  const [topic] = await getDb().insert(learningTopics).values({
    id: topicId,
    classroomId: params.classroomId,
    createdByUserId: params.createdByUserId,
    courseId: course.id,
    title: params.title,
    description: params.description || null,
    contentLocale: params.contentLocale,
    status: LEARNING_STATUS.topicDraft,
    openingPreference: LEARNING_STATUS.topicOpeningAuto,
    sourceBoundary,
    learningOutcomes,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return requireValue(topic, "Failed to create learning topic.");
}

export async function updateLearningTopicDetails(params: {
  topicId: string;
  title?: string;
  description?: string;
  contentLocale?: "en" | "fr" | "de";
  learningOutcomes?: LearningOutcomeDefinition[];
  sourceBoundary?: Partial<TopicSourceBoundary>;
}) {
  const existing = await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, params.topicId),
    columns: {
      sourceBoundary: true,
      learningOutcomes: true,
    },
  });

  if (!existing) {
    throw new Error("Topic not found");
  }

  const learningOutcomes = (params.learningOutcomes ?? existing.learningOutcomes ?? []).map(
    (outcome, index) => normalizeLearningOutcome(outcome, index),
  );

  const sourceBoundary = topicSourceBoundarySchema.parse({
    ...(existing.sourceBoundary ?? {}),
    ...params.sourceBoundary,
    teacherSummary:
      params.sourceBoundary?.teacherSummary ??
      params.description ??
      existing.sourceBoundary?.teacherSummary ??
      "",
  });

  const [topic] = await getDb()
    .update(learningTopics)
    .set({
      title: params.title,
      description: params.description,
      contentLocale: params.contentLocale,
      learningOutcomes,
      sourceBoundary,
      updatedAt: new Date(),
    })
    .where(eq(learningTopics.id, params.topicId))
    .returning();

  return requireValue(topic, "Failed to update learning topic details.");
}

/**
 * List topics for a classroom
 */
export async function listTopicsByClassroom(classroomId: string) {
  return await getDb().query.learningTopics.findMany({
    where: eq(learningTopics.classroomId, classroomId),
    orderBy: (table, { desc }) => [desc(table.updatedAt)],
  });
}

export const createTeachingSession = createLearningTopic;
export const updateTeachingSessionDetails = updateLearningTopicDetails;
export const listSessionsByClassroom = listTopicsByClassroom;
