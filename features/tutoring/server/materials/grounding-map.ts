import {
  materialGroundingMapSchema,
  type MaterialGroundingMap,
  type MaterialSourceDocument,
} from "@/features/tutoring/public-server";

import {
  MATERIAL_SEGMENT_GROUNDING_CONCURRENCY,
  mapWithConcurrency,
} from "./material-analysis-runtime";
import { resolveGroundingMapSynthesis } from "./grounding-map-synthesis";
import {
  buildDeterministicSections,
  groundMaterialSegment,
} from "./segment-grounding";
import {
  collectUniqueObjects,
  uniqueStrings,
} from "./text-processing";

export async function buildMaterialGroundingMap(params: {
  topicTitle: string;
  materialId: string;
  materialTitle: string;
  sourceDocument: MaterialSourceDocument;
  traceId?: string;
  topicId?: string;
}) {
  const groundedSegments = await mapWithConcurrency(
    params.sourceDocument.segments,
    MATERIAL_SEGMENT_GROUNDING_CONCURRENCY,
    async (segment) =>
      await groundMaterialSegment({
        topicTitle: params.topicTitle,
        materialTitle: params.materialTitle,
        materialId: params.materialId,
        segment,
        traceId: params.traceId,
        topicId: params.topicId,
      }),
  );

  const sections = buildDeterministicSections(groundedSegments, params.materialId);
  const concepts = collectUniqueObjects<MaterialGroundingMap["concepts"][number]>(
    groundedSegments.flatMap((segment) => segment.concepts),
    (item) => item.name,
  );
  const definitions = collectUniqueObjects<MaterialGroundingMap["definitions"][number]>(
    groundedSegments.flatMap((segment) => segment.definitions),
    (item) => item.term,
  );
  const procedures = collectUniqueObjects<MaterialGroundingMap["procedures"][number]>(
    groundedSegments.flatMap((segment) => segment.procedures),
    (item) => item.name,
  );
  const formulas = collectUniqueObjects<MaterialGroundingMap["formulas"][number]>(
    groundedSegments.flatMap((segment) => segment.formulas),
    (item) => `${item.label}::${item.expression}`,
  );

  const synthesis = await resolveGroundingMapSynthesis({
    topicTitle: params.topicTitle,
    materialTitle: params.materialTitle,
    groundedSegments,
    sections,
    traceId: params.traceId,
    topicId: params.topicId,
    materialId: params.materialId,
  });

  return materialGroundingMapSchema.parse({
    version: 1,
    builtAt: new Date().toISOString(),
    sourceHash: params.sourceDocument.sourceHash,
    materialId: params.materialId,
    sourceTitle: params.materialTitle,
    overview: synthesis.overview,
    sections,
    concepts,
    definitions,
    procedures,
    formulas: formulas.map((formula) => ({
      label: formula.label,
      expression: formula.expression,
      conditions: formula.conditions,
      usageNotes: formula.usageNotes,
      citations: formula.citations,
    })),
    notationRules: uniqueStrings([
      ...groundedSegments.flatMap((segment) => segment.notationRules),
      ...synthesis.notationRules,
    ]),
    rigorRules: uniqueStrings([
      ...groundedSegments.flatMap((segment) => segment.rigorSignals),
      ...synthesis.rigorRules,
    ]),
    scopeRules: uniqueStrings([
      ...groundedSegments.flatMap((segment) => segment.scopeInclusions),
      ...synthesis.scopeRules,
    ]),
    explicitlyOutOfScope: uniqueStrings([
      ...groundedSegments.flatMap((segment) => segment.scopeExclusions),
      ...synthesis.explicitlyOutOfScope,
    ]),
    teachingNotes: uniqueStrings(synthesis.teachingNotes),
    ambiguities: uniqueStrings(
      groundedSegments.flatMap((segment) => segment.ambiguities),
    ),
    segmentGroundings: groundedSegments,
  });
}
