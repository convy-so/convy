import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { lessons } from "@/shared/db/schema";
import {
  TUTORING_LIMITS,
  TUTORING_STATUS,
} from "@/shared/tutoring/constants";
import { getCourseById } from "@/features/tutoring/server/course-service";
import {
  learningOutcomeDefinitionSchema,
  lessonSourceBoundarySchema,
  type LearningOutcomeDefinition,
  type LessonSourceBoundary,
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
      outcome.masteryThreshold ?? TUTORING_LIMITS.defaultLearningOutcomeMasteryThreshold,
    misconceptionTags: outcome.misconceptionTags ?? [],
  });
}

/**
 * Create a new lesson with outcomes and source boundaries
 */
export async function createLesson(params: {
  classroomId: string;
  createdByUserId: string;
  title: string;
  description?: string;
  courseId: string;
  contentLocale: "en" | "fr" | "de";
  learningOutcomes?: LearningOutcomeDefinition[];
  sourceBoundary?: Partial<LessonSourceBoundary>;
}) {
  const lessonId = nanoid();
  const now = new Date();

  const learningOutcomes = (params.learningOutcomes ?? []).map((outcome, index) =>
    normalizeLearningOutcome(outcome, index),
  );

  const sourceBoundary = lessonSourceBoundarySchema.parse({
    ...params.sourceBoundary,
    teacherSummary: params.sourceBoundary?.teacherSummary ?? params.description ?? "",
  });
  const course = await getCourseById(params.courseId);

  if (!course) {
    throw new Error("Course not found");
  }

  const [lesson] = await getDb().insert(lessons).values({
    id: lessonId,
    classroomId: params.classroomId,
    createdByUserId: params.createdByUserId,
    courseId: course.id,
    title: params.title,
    description: params.description || null,
    contentLocale: params.contentLocale,
    status: TUTORING_STATUS.lessonDraft,
    openingPreference: TUTORING_STATUS.lessonOpeningAuto,
    sourceBoundary,
    learningOutcomes,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return requireValue(lesson, "Failed to create lesson.");
}

export async function updateLessonDetails(params: {
  lessonId: string;
  title?: string;
  description?: string;
  contentLocale?: "en" | "fr" | "de";
  learningOutcomes?: LearningOutcomeDefinition[];
  sourceBoundary?: Partial<LessonSourceBoundary>;
}) {
  const existing = await getDb().query.lessons.findFirst({
    where: eq(lessons.id, params.lessonId),
    columns: {
      sourceBoundary: true,
      learningOutcomes: true,
    },
  });

  if (!existing) {
    throw new Error("Lesson not found");
  }

  const learningOutcomes = (params.learningOutcomes ?? existing.learningOutcomes ?? []).map(
    (outcome, index) => normalizeLearningOutcome(outcome, index),
  );

  const sourceBoundary = lessonSourceBoundarySchema.parse({
    ...(existing.sourceBoundary ?? {}),
    ...params.sourceBoundary,
    teacherSummary:
      params.sourceBoundary?.teacherSummary ??
      params.description ??
      existing.sourceBoundary?.teacherSummary ??
      "",
  });

  const [lesson] = await getDb()
    .update(lessons)
    .set({
      title: params.title,
      description: params.description,
      contentLocale: params.contentLocale,
      learningOutcomes,
      sourceBoundary,
      updatedAt: new Date(),
    })
    .where(eq(lessons.id, params.lessonId))
    .returning();

  return requireValue(lesson, "Failed to update lesson details.");
}

/**
 * List lessons for a classroom
 */
export async function listLessonsByClassroom(classroomId: string) {
  return await getDb().query.lessons.findMany({
    where: eq(lessons.classroomId, classroomId),
    orderBy: (table, { desc }) => [desc(table.updatedAt)],
  });
}

export const createTeachingSession = createLesson;
export const updateTeachingSessionDetails = updateLessonDetails;
export const listSessionsByClassroom = listLessonsByClassroom;


