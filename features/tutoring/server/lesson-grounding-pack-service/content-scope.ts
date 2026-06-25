import {
  topicSourceBoundarySchema,
  type ContentScopeSnapshot,
  type LearningOutcomeDefinition,
  type TopicGroundingPack,
  type TopicSourceBoundary,
} from "@/features/tutoring/public-server";

import { packToRetrievedContextLines, uniqueStrings, mergePackWithBoundary } from "./core";
import { createEmptyTopicGroundingPack } from "./rebuild-pack";

export function buildContentScopeFromPack(params: {
  topicId: string;
  topicTitle: string;
  contentLocale: string;
  sourceBoundary: TopicSourceBoundary;
  learningOutcomes: LearningOutcomeDefinition[];
  pack: TopicGroundingPack | null;
  materialIds: string[];
}): ContentScopeSnapshot {
  const boundary = topicSourceBoundarySchema.parse(params.sourceBoundary);
  const pack = params.pack
    ? mergePackWithBoundary(params.pack, boundary)
    : createEmptyTopicGroundingPack({
        topicTitle: params.topicTitle,
        materialIds: params.materialIds,
        teacherSummary: boundary.teacherSummary,
      });

  return {
    topicId: params.topicId,
    topicTitle: params.topicTitle,
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
    topicGroundingPack: pack,
  };
}
