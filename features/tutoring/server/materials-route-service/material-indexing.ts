import { eq } from "drizzle-orm";

import { getTeacherTopicAccess } from "@/features/tutoring/server/access";
import { indexLearningMaterialEvidence } from "@/features/tutoring/server/evidence";
import { topicSourceBoundarySchema } from "@/features/tutoring/public-server";
import { getDb } from "@/shared/db";
import { learningTopics, topicMaterials } from "@/shared/db/schema";
import { LEARNING_STATUS } from "@/shared/learning/constants";

export async function indexMaterialAndSyncBoundary(params: {
  topicId: string;
  materialId: string;
  material: typeof topicMaterials.$inferSelect;
  mimeType: string;
  extractedText: string;
  analysis: Record<string, unknown>;
  sourceDocument: Record<string, unknown>;
  groundingMap: Record<string, unknown>;
  topic: NonNullable<Awaited<ReturnType<typeof getTeacherTopicAccess>>>;
}) {
  const currentTopic = await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, params.topicId),
    columns: { sourceBoundary: true },
  });
  const existingBoundary = topicSourceBoundarySchema.parse(currentTopic?.sourceBoundary ?? {});
  const updatedBoundary = topicSourceBoundarySchema.parse({
    ...existingBoundary,
    rigorNotes: Array.from(
      new Set([
        ...(existingBoundary.rigorNotes || []),
        ...((params.analysis.rigorNotes as string[]) || []),
        ...((params.groundingMap.rigorRules as string[]) || []),
      ]),
    ),
    notationNotes: Array.from(
      new Set([
        ...(existingBoundary.notationNotes || []),
        ...((params.analysis.notationNotes as string[]) || []),
        ...((params.groundingMap.notationRules as string[]) || []),
      ]),
    ),
    scopeNotes: Array.from(
      new Set([
        ...(existingBoundary.scopeNotes || []),
        ...((params.analysis.scopeNotes as string[]) || []),
        ...((params.groundingMap.scopeRules as string[]) || []),
      ]),
    ),
  });

  await indexLearningMaterialEvidence({
    materialId: params.materialId,
    topicId: params.topicId,
    classroomId: params.topic.classroomId,
    language: params.topic.contentLocale,
    subjectKey: params.topic.courseId,
    gradeBand: params.topic.classroom.gradeBand,
    sourceTitle: params.material.title,
    sourceUpdatedAt: params.material.updatedAt ?? new Date(),
    sourceDocument: params.sourceDocument,
    groundingMap: params.groundingMap,
  });

  await Promise.all([
    getDb()
      .update(topicMaterials)
      .set({
        indexingStatus: LEARNING_STATUS.materialCompleted,
        indexingError: null,
        updatedAt: new Date(),
      })
      .where(eq(topicMaterials.id, params.materialId)),
    getDb()
      .update(learningTopics)
      .set({
        sourceBoundary: updatedBoundary,
        lastMaterialSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(learningTopics.id, params.topicId)),
  ]);
}
