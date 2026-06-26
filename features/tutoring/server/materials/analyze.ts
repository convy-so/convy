import {
  materialSourceDocumentSchema,
  type MaterialCoverageReview,
} from "@/features/tutoring/public-server";
import { MAX_TEXT_EXTRACTION_CHARS } from "@/shared/security/uploads";

import { buildMaterialCoverageReview } from "./coverage-review";
import { buildLegacySourceDocument } from "./extraction";
import { buildMaterialGroundingMap } from "./grounding-map";

export async function analyzeLearningMaterial(params: {
  lessonTitle: string;
  lessonDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  materialText: string;
}) {
  const sourceDocument = materialSourceDocumentSchema.parse({
    ...buildLegacySourceDocument({
      lessonTitle: params.lessonTitle,
      materialText: params.materialText,
    }),
    truncated: params.materialText.length >= MAX_TEXT_EXTRACTION_CHARS,
  });

  const groundingMap = await buildMaterialGroundingMap({
    lessonTitle: params.lessonTitle,
    materialId: sourceDocument.materialId,
    materialTitle: sourceDocument.sourceTitle,
    sourceDocument,
  });

  const analysis = await buildMaterialCoverageReview({
    lessonTitle: params.lessonTitle,
    lessonDescription: params.lessonDescription,
    learningOutcomes: params.learningOutcomes,
    materialGroundingMaps: [groundingMap],
  });

  return analysis satisfies MaterialCoverageReview;
}

