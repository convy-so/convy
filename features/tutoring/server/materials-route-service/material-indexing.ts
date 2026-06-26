import { eq } from "drizzle-orm";

import { getTeacherLessonAccess } from "@/features/tutoring/server/access";
import { indexLessonMaterialEvidence } from "@/features/tutoring/server/evidence";
import { lessonSourceBoundarySchema } from "@/features/tutoring/public-server";
import { getDb } from "@/shared/db";
import { lessons, lessonMaterials } from "@/shared/db/schema";
import { LEARNING_STATUS } from "@/shared/learning/constants";

export async function indexMaterialAndSyncBoundary(params: {
  lessonId: string;
  materialId: string;
  material: typeof lessonMaterials.$inferSelect;
  mimeType: string;
  extractedText: string;
  analysis: Record<string, unknown>;
  sourceDocument: Record<string, unknown>;
  groundingMap: Record<string, unknown>;
  lesson: NonNullable<Awaited<ReturnType<typeof getTeacherLessonAccess>>>;
}) {
  const currentLesson = await getDb().query.lessons.findFirst({
    where: eq(lessons.id, params.lessonId),
    columns: { sourceBoundary: true },
  });
  const existingBoundary = lessonSourceBoundarySchema.parse(currentLesson?.sourceBoundary ?? {});
  const updatedBoundary = lessonSourceBoundarySchema.parse({
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

  await indexLessonMaterialEvidence({
    materialId: params.materialId,
    lessonId: params.lessonId,
    classroomId: params.lesson.classroomId,
    language: params.lesson.contentLocale,
    subjectKey: params.lesson.courseId,
    gradeBand: params.lesson.classroom.gradeBand,
    sourceTitle: params.material.title,
    sourceUpdatedAt: params.material.updatedAt ?? new Date(),
    sourceDocument: params.sourceDocument,
    groundingMap: params.groundingMap,
  });

  await Promise.all([
    getDb()
      .update(lessonMaterials)
      .set({
        indexingStatus: LEARNING_STATUS.materialCompleted,
        indexingError: null,
        updatedAt: new Date(),
      })
      .where(eq(lessonMaterials.id, params.materialId)),
    getDb()
      .update(lessons)
      .set({
        sourceBoundary: updatedBoundary,
        lastMaterialSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(lessons.id, params.lessonId)),
  ]);
}

