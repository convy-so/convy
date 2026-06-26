import { Output, generateText } from "ai";

import { buildMaterialGroundingMapPrompt } from "@/features/tutoring/server/prompts/materials";
import {
  type MaterialGroundingMap,
  type MaterialGroundingSegment,
} from "@/features/tutoring/public-server";

import {
  ENABLE_AI_GROUNDING_MAP_SYNTHESIS,
  GOOGLE_ANALYSIS_PROVIDER_OPTIONS,
  MATERIAL_MAP_SYNTHESIS_OUTPUT_TOKENS,
  MATERIAL_REVIEW_MAX_RETRIES,
  isAiQuotaError,
  materialAnalysisModel,
  materialGroundingSynthesisSchema,
  serializeAiError,
} from "./material-analysis-runtime";
import { uniqueStrings } from "./text-processing";

async function synthesizeGroundingMap(params: {
  lessonTitle: string;
  materialTitle: string;
  groundedSegments: MaterialGroundingSegment[];
  traceId?: string;
  lessonId?: string;
  materialId: string;
}) {
  const groundedSegmentsJson = JSON.stringify(
    params.groundedSegments.map((segment) => ({
      segmentId: segment.segmentId,
      headingPath: segment.headingPath,
      pageStart: segment.pageStart,
      pageEnd: segment.pageEnd,
      concepts: segment.concepts.map((item) => ({
        name: item.name,
        summary: item.summary,
      })),
      definitions: segment.definitions.map((item) => ({
        term: item.term,
        definition: item.definition,
      })),
      procedures: segment.procedures.map((item) => ({
        name: item.name,
        summary: item.summary,
        steps: item.steps,
      })),
      formulas: segment.formulas.map((item) => ({
        label: item.label,
        expression: item.expression,
        conditions: item.conditions,
        usageNotes: item.usageNotes,
      })),
      workedExamples: segment.workedExamples,
      notationRules: segment.notationRules,
      rigorSignals: segment.rigorSignals,
      scopeInclusions: segment.scopeInclusions,
      scopeExclusions: segment.scopeExclusions,
      ambiguities: segment.ambiguities,
    })),
  );

  const prompt = buildMaterialGroundingMapPrompt({
    lessonTitle: params.lessonTitle,
    materialTitle: params.materialTitle,
    groundedSegmentsJson,
  });

  const result = await generateText({
    model: materialAnalysisModel,
    output: Output.object({
      schema: materialGroundingSynthesisSchema,
      name: "MaterialGroundingMapSynthesis",
      description: "Teacher-facing synthesis of a full material grounding map.",
    }),
    maxOutputTokens: MATERIAL_MAP_SYNTHESIS_OUTPUT_TOKENS,
    maxRetries: MATERIAL_REVIEW_MAX_RETRIES,
    temperature: 0,
    prompt,
    providerOptions: GOOGLE_ANALYSIS_PROVIDER_OPTIONS,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "lesson_material_grounding_map_synthesis",
      metadata: {
        traceId: params.traceId ?? "",
        lessonId: params.lessonId ?? "",
        materialId: params.materialId,
      },
    },
  });

  return materialGroundingSynthesisSchema.parse(result.output);
}

function buildGroundingMapFallback(params: {
  groundedSegments: MaterialGroundingSegment[];
  sections: MaterialGroundingMap["sections"];
}) {
  const notationRules = uniqueStrings(
    params.groundedSegments.flatMap((segment) => segment.notationRules),
  );
  const rigorRules = uniqueStrings(
    params.groundedSegments.flatMap((segment) => segment.rigorSignals),
  );
  const scopeRules = uniqueStrings(
    params.groundedSegments.flatMap((segment) => segment.scopeInclusions),
  );
  const explicitlyOutOfScope = uniqueStrings(
    params.groundedSegments.flatMap((segment) => segment.scopeExclusions),
  );
  const overview =
    params.sections
      .slice(0, 3)
      .map((section) => section.title)
      .filter(Boolean)
      .join("; ") || "Grounding map compiled from uploaded material segments.";

  return {
    overview,
    teachingNotes: uniqueStrings(
      params.groundedSegments.flatMap((segment) => segment.ambiguities),
    ).slice(0, 4),
    notationRules,
    rigorRules,
    scopeRules,
    explicitlyOutOfScope,
  };
}

export async function resolveGroundingMapSynthesis(params: {
  lessonTitle: string;
  materialTitle: string;
  groundedSegments: MaterialGroundingSegment[];
  sections: MaterialGroundingMap["sections"];
  traceId?: string;
  lessonId?: string;
  materialId: string;
}) {
  if (!ENABLE_AI_GROUNDING_MAP_SYNTHESIS) {
    return buildGroundingMapFallback({
      groundedSegments: params.groundedSegments,
      sections: params.sections,
    });
  }

  return await synthesizeGroundingMap(params).catch((error) => {
    console.warn(
      "[lesson-material-upload] grounding map synthesis failed; using fallback",
      {
        traceId: params.traceId ?? null,
        lessonId: params.lessonId ?? null,
        materialId: params.materialId,
        quota: isAiQuotaError(error),
        ...serializeAiError(error),
      },
    );
    return buildGroundingMapFallback({
      groundedSegments: params.groundedSegments,
      sections: params.sections,
    });
  });
}

