import {
  materialSourceDocumentSchema,
  type MaterialCoverageReview,
} from "@/features/tutoring/public-server";
import { MAX_TEXT_EXTRACTION_CHARS } from "@/shared/security/uploads";

import { buildMaterialCoverageReview } from "./coverage-review";
import { buildLegacySourceDocument } from "./extraction";
import { buildMaterialGroundingMap } from "./grounding-map";

export async function analyzeLearningMaterial(params: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  materialText: string;
}) {
  const sourceDocument = materialSourceDocumentSchema.parse({
    ...buildLegacySourceDocument({
      topicTitle: params.topicTitle,
      materialText: params.materialText,
    }),
    truncated: params.materialText.length >= MAX_TEXT_EXTRACTION_CHARS,
  });

  const groundingMap = await buildMaterialGroundingMap({
    topicTitle: params.topicTitle,
    materialId: sourceDocument.materialId,
    materialTitle: sourceDocument.sourceTitle,
    sourceDocument,
  });

  const review = await buildMaterialCoverageReview({
    topicTitle: params.topicTitle,
    topicDescription: params.topicDescription,
    learningOutcomes: params.learningOutcomes,
    materialGroundingMaps: [groundingMap],
  });

  return review satisfies MaterialCoverageReview;
}
