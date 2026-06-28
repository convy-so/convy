import {
  contentScopeSnapshotSchema,
  lessonSourceBoundarySchema,
  type ContentScopeSnapshot,
  type LearningOutcomeDefinition,
  type LessonGroundingPack,
  type LessonSourceBoundary,
  getCachedLessonWithMaterials,
} from "@/features/tutoring/public-server";
import { TUTORING_STATUS } from "@/shared/tutoring/constants";

import {
  mergePackWithBoundary,
  packToRetrievedContextLines,
  uniqueStrings,
} from "./core";
import { createEmptyLessonGroundingPack } from "./rebuild-pack";

export function buildContentScopeFromPack(params: {
  lessonId: string;
  lessonTitle: string;
  contentLocale: string;
  sourceBoundary: LessonSourceBoundary;
  learningOutcomes: LearningOutcomeDefinition[];
  pack: LessonGroundingPack | null;
  materialIds: string[];
}): ContentScopeSnapshot {
  const boundary = lessonSourceBoundarySchema.parse(params.sourceBoundary);
  const pack = params.pack
    ? mergePackWithBoundary(params.pack, boundary)
    : createEmptyLessonGroundingPack({
        lessonTitle: params.lessonTitle,
        materialIds: params.materialIds,
        teacherSummary: boundary.teacherSummary,
      });

  return {
    lessonId: params.lessonId,
    lessonTitle: params.lessonTitle,
    contentLocale: params.contentLocale,
    teacherSummary: boundary.teacherSummary || pack.digest,
    materialIds:
      boundary.allowedMaterialIds.length > 0
        ? boundary.allowedMaterialIds
        : params.materialIds,
    scopeNotes: uniqueStrings([...boundary.scopeNotes, ...pack.scopeRules]),
    notationNotes: uniqueStrings([
      ...boundary.notationNotes,
      ...pack.notationRules,
    ]),
    rigorNotes: uniqueStrings([...boundary.rigorNotes, ...pack.rigorRules]),
    retrievedContext: packToRetrievedContextLines(pack),
    learningOutcomes: params.learningOutcomes,
    groundingPackVersion: pack.version,
    lessonGroundingPack: pack,
  };
}

export async function buildLessonContentScopeFromPack(params: {
  lessonId: string;
  sourceBoundary: LessonSourceBoundary;
  contentLocale?: string | null;
}): Promise<ContentScopeSnapshot> {
  const lesson = await getCachedLessonWithMaterials(params.lessonId);
  if (!lesson) {
    throw new Error("Lesson not found.");
  }

  const materialIds = lesson.materials
    .filter(
      (material) =>
        material.indexingStatus === TUTORING_STATUS.materialCompleted,
    )
    .map((material) => material.id);

  const snapshot = buildContentScopeFromPack({
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    contentLocale: params.contentLocale ?? lesson.contentLocale,
    sourceBoundary: params.sourceBoundary,
    learningOutcomes: lesson.learningOutcomes ?? [],
    pack: lesson.lessonGroundingPack ?? null,
    materialIds,
  });

  return contentScopeSnapshotSchema.parse(snapshot);
}
