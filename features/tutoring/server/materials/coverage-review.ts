import { Output, generateText } from "ai";

import { buildMaterialCoverageReviewPrompt } from "@/features/tutoring/server/prompts/materials";
import {
  materialCoverageReviewSchema,
  type MaterialGroundingMap,
} from "@/features/tutoring/public-server";

import {
  GOOGLE_ANALYSIS_PROVIDER_OPTIONS,
  MATERIAL_COVERAGE_REVIEW_OUTPUT_TOKENS,
  MATERIAL_REVIEW_MAX_RETRIES,
  getErrorMessage,
  getModelId,
  isAiQuotaError,
  logLearningMaterialTrace,
  materialAnalysisModel,
  serializeAiError,
} from "./material-analysis-runtime";
import { uniqueStrings } from "./text-processing";

async function attemptBuildCoverageReview(params: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  materialGroundingMaps: MaterialGroundingMap[];
  traceId?: string;
  topicId?: string;
  fileName?: string;
}) {
  const prompt = buildMaterialCoverageReviewPrompt({
    topicTitle: params.topicTitle,
    topicDescription: params.topicDescription,
    learningOutcomes: params.learningOutcomes,
    materialGroundingMapsJson: JSON.stringify(
      params.materialGroundingMaps.map((map) => ({
        materialId: map.materialId,
        sourceTitle: map.sourceTitle,
        overview: map.overview,
        sections: map.sections.map((section) => ({
          title: section.title,
          summary: section.summary,
          keyPoints: section.keyPoints,
        })),
        concepts: map.concepts.map((concept) => ({
          name: concept.name,
          summary: concept.summary,
        })),
        definitions: map.definitions.map((definition) => ({
          term: definition.term,
          definition: definition.definition,
        })),
        procedures: map.procedures.map((procedure) => ({
          name: procedure.name,
          summary: procedure.summary,
          steps: procedure.steps,
        })),
        formulas: map.formulas.map((formula) => ({
          label: formula.label,
          expression: formula.expression,
          conditions: formula.conditions,
          usageNotes: formula.usageNotes,
        })),
        notationRules: map.notationRules,
        rigorRules: map.rigorRules,
        scopeRules: map.scopeRules,
        explicitlyOutOfScope: map.explicitlyOutOfScope,
        teachingNotes: map.teachingNotes,
        ambiguities: map.ambiguities,
      })),
    ),
  });

  const result = await generateText({
    model: materialAnalysisModel,
    output: Output.object({
      schema: materialCoverageReviewSchema,
      name: "MaterialCoverageReview",
      description: "Teacher-facing review of how uploaded material supports the topic outcomes.",
    }),
    maxOutputTokens: MATERIAL_COVERAGE_REVIEW_OUTPUT_TOKENS,
    maxRetries: MATERIAL_REVIEW_MAX_RETRIES,
    temperature: 0,
    prompt,
    providerOptions: GOOGLE_ANALYSIS_PROVIDER_OPTIONS,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "learning_material_coverage_review",
      metadata: {
        traceId: params.traceId ?? "",
        topicId: params.topicId ?? "",
        filename: params.fileName ?? "",
      },
    },
  });

  return materialCoverageReviewSchema.parse(result.output);
}

function buildCoverageReviewFallback(params: {
  materialGroundingMaps: MaterialGroundingMap[];
  learningOutcomes: Array<{ title: string; description: string }>;
}) {
  const map = params.materialGroundingMaps[0];
  const outcomeTitles = params.learningOutcomes.map((outcome) => outcome.title);
  const unsupportedOutcomes =
    params.learningOutcomes.length === 0 ? [] : outcomeTitles;

  return materialCoverageReviewSchema.parse({
    summary:
      "Coverage review fallback generated because the AI review step did not complete cleanly.",
    groundingSummary:
      map?.overview ||
      "Uploaded material was grounded successfully, but outcome coverage needs manual review.",
    supportedOutcomes: [],
    partialOutcomes: [],
    unsupportedOutcomes,
    clarifyingQuestions: [],
    coverageObservations: uniqueStrings([
      ...(map?.scopeRules ?? []),
      ...(map?.ambiguities ?? []),
    ]).slice(0, 6),
    recommendedOutcomeEdits: [],
    rigorNotes: map?.rigorRules ?? [],
    notationNotes: map?.notationRules ?? [],
    scopeNotes: map?.scopeRules ?? [],
  });
}

export async function buildMaterialCoverageReview(params: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  materialGroundingMaps: MaterialGroundingMap[];
  traceId?: string;
  topicId?: string;
  fileName?: string;
}) {
  if (params.materialGroundingMaps.length === 0) {
    return materialCoverageReviewSchema.parse({
      summary: "No grounded materials were available for review.",
      groundingSummary: "",
      supportedOutcomes: [],
      partialOutcomes: [],
      unsupportedOutcomes: params.learningOutcomes.map((outcome) => outcome.title),
      clarifyingQuestions: [],
      coverageObservations: [],
      recommendedOutcomeEdits: [],
      rigorNotes: [],
      notationNotes: [],
      scopeNotes: [],
    });
  }

  try {
    console.info("[learning-material-upload] coverage review attempt", {
      traceId: params.traceId ?? null,
      topicId: params.topicId ?? null,
      fileName: params.fileName ?? null,
      model: getModelId(materialAnalysisModel),
      groundingMapCount: params.materialGroundingMaps.length,
      learningOutcomeCount: params.learningOutcomes.length,
    });

    return await attemptBuildCoverageReview(params);
  } catch (error) {
    console.warn("[learning-material-upload] coverage review attempt failed", {
      traceId: params.traceId ?? null,
      topicId: params.topicId ?? null,
      fileName: params.fileName ?? null,
      quota: isAiQuotaError(error),
      ...serializeAiError(error),
    });

    logLearningMaterialTrace({
      event: "learning_material_coverage_review_failed",
      input: {
        traceId: params.traceId ?? "",
        topicId: params.topicId ?? "",
        filename: params.fileName ?? "",
      },
      metadata: {
        error: getErrorMessage(error),
        groundingMapCount: params.materialGroundingMaps.length,
        learningOutcomeCount: params.learningOutcomes.length,
      },
    });

    return buildCoverageReviewFallback(params);
  }
}
