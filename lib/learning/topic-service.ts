import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { learningTopics } from "@/db/schema";
import { deriveSubjectInfo } from "@/lib/learning/patterns";
import {
  learningOutcomeDefinitionSchema,
  topicSourceBoundarySchema,
  type LearningOutcomeDefinition,
  type TopicSourceBoundary,
} from "@/lib/learning/types";

function normalizeLearningOutcome(
  outcome: LearningOutcomeDefinition,
  index: number,
): LearningOutcomeDefinition {
  return learningOutcomeDefinitionSchema.parse({
    id: outcome.id || `outcome-${index + 1}`,
    title: outcome.title,
    description: outcome.description,
    evidenceSignals: outcome.evidenceSignals ?? [],
    masteryThreshold: outcome.masteryThreshold ?? 70,
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
  subject?: string;
  subjectKey?: string;
  subjectLabel?: string;
  contentLocale: "en" | "fr" | "de";
  learningOutcomes: LearningOutcomeDefinition[];
  sourceBoundary?: Partial<TopicSourceBoundary>;
}) {
  const topicId = nanoid();
  const now = new Date();

  const learningOutcomes = params.learningOutcomes.map((outcome, index) =>
    normalizeLearningOutcome(outcome, index),
  );

  const sourceBoundary = topicSourceBoundarySchema.parse({
    ...params.sourceBoundary,
    teacherSummary: params.sourceBoundary?.teacherSummary ?? params.description ?? "",
  });

  const subjectInfo = deriveSubjectInfo({
    subjectKey: params.subjectKey,
    subjectLabel: params.subjectLabel,
    subject: params.subject,
  });

  const [topic] = await getDb().insert(learningTopics).values({
    id: topicId,
    classroomId: params.classroomId,
    createdByUserId: params.createdByUserId,
    title: params.title,
    description: params.description || null,
    subject: subjectInfo.subjectLabel,
    contentLocale: params.contentLocale,
    subjectKey: subjectInfo.subjectKey,
    subjectLabel: subjectInfo.subjectLabel,
    status: "draft",
    openingPreference: "auto",
    sourceBoundary,
    learningOutcomes,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return topic;
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
