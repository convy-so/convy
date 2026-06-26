import {
  lessonSourceBoundarySchema,
  type ContentScopeSnapshot,
  type LearningOutcomeDefinition,
  type LessonGroundingPack,
  type LessonSourceBoundary,
} from "@/features/tutoring/public-server";

import { packToRetrievedContextLines, uniqueStrings, mergePackWithBoundary } from "./core";
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
    notationNotes: uniqueStrings([...boundary.notationNotes, ...pack.notationRules]),
    rigorNotes: uniqueStrings([...boundary.rigorNotes, ...pack.rigorRules]),
    retrievedContext: packToRetrievedContextLines(pack),
    learningOutcomes: params.learningOutcomes,
    groundingPackVersion: pack.version,
    lessonGroundingPack: pack,
  };
}

