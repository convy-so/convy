import { Output, generateText } from "ai";
import { nanoid } from "nanoid";

import { buildMaterialSegmentGroundingPrompt } from "@/features/tutoring/server/prompts/materials";
import {
  materialGroundingSegmentSchema,
  type GroundingCitation,
  type MaterialGroundingSegment,
  type MaterialSourceDocument,
} from "@/features/tutoring/public-server";

import {
  GOOGLE_ANALYSIS_PROVIDER_OPTIONS,
  MATERIAL_SEGMENT_GROUNDING_MAX_RETRIES,
  MATERIAL_SEGMENT_GROUNDING_OUTPUT_TOKENS,
  isAiQuotaError,
  materialAnalysisModel,
  rawSegmentGroundingSchema,
  serializeAiError,
} from "./material-analysis-runtime";
import {
  buildCitation,
  extractDefinitionCandidates,
  extractWorkedExamples,
  mergeCitations,
  normalizeKey,
  summarizeText,
  uniqueStrings,
} from "./text-processing";

export async function groundMaterialSegment(params: {
  topicTitle: string;
  materialTitle: string;
  materialId: string;
  segment: MaterialSourceDocument["segments"][number];
  traceId?: string;
  topicId?: string;
}) {
  const citation = buildCitation({
    materialId: params.materialId,
    segment: params.segment,
  });
  const headingTitle =
    params.segment.headingPath[params.segment.headingPath.length - 1]?.trim() ||
    params.segment.headingPath[0]?.trim() ||
    "";
  const summaryPoints = summarizeText(params.segment.text, 3);
  const definitionCandidates = extractDefinitionCandidates(params.segment.text);
  const fallbackWorkedExamples = uniqueStrings([
    ...extractWorkedExamples(params.segment.text),
    ...summaryPoints.slice(headingTitle ? 1 : 0),
  ]).slice(0, 3);

  const buildFallback = () =>
    materialGroundingSegmentSchema.parse({
      segmentId: params.segment.segmentId,
      order: params.segment.order,
      pageStart: params.segment.pageStart,
      pageEnd: params.segment.pageEnd,
      headingPath: params.segment.headingPath,
      concepts: headingTitle
        ? [
            {
              name: headingTitle,
              summary: summaryPoints[0] ?? "",
              citations: [citation],
            },
          ]
        : [],
      definitions: definitionCandidates.map((match) => ({
        term: match[1]?.trim() ?? "",
        definition: match[2]?.trim() ?? "",
        citations: [citation],
      })),
      procedures: [],
      formulas: [],
      workedExamples: fallbackWorkedExamples,
      notationRules: [],
      rigorSignals: [],
      scopeInclusions: summaryPoints.slice(0, 2),
      scopeExclusions: [],
      ambiguities: [],
    });

  const prompt = buildMaterialSegmentGroundingPrompt({
    topicTitle: params.topicTitle,
    materialTitle: params.materialTitle,
    segmentOrder: params.segment.order + 1,
    headingPath: params.segment.headingPath,
    pageStart: params.segment.pageStart,
    pageEnd: params.segment.pageEnd,
    segmentText: params.segment.text,
  });

  try {
    const result = await generateText({
      model: materialAnalysisModel,
      output: Output.object({
        schema: rawSegmentGroundingSchema,
        name: "MaterialSegmentGrounding",
        description: "Grounded teaching facts extracted from one source segment.",
      }),
      maxOutputTokens: MATERIAL_SEGMENT_GROUNDING_OUTPUT_TOKENS,
      maxRetries: MATERIAL_SEGMENT_GROUNDING_MAX_RETRIES,
      temperature: 0,
      prompt,
      providerOptions: GOOGLE_ANALYSIS_PROVIDER_OPTIONS,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "learning_material_segment_grounding",
        metadata: {
          traceId: params.traceId ?? "",
          topicId: params.topicId ?? "",
          materialId: params.materialId,
          segmentId: params.segment.segmentId,
        },
      },
    });

    const raw = rawSegmentGroundingSchema.parse(result.output);

    return materialGroundingSegmentSchema.parse({
      segmentId: params.segment.segmentId,
      order: params.segment.order,
      pageStart: params.segment.pageStart,
      pageEnd: params.segment.pageEnd,
      headingPath: params.segment.headingPath,
      concepts: raw.concepts.map((concept) => ({
        ...concept,
        citations: [citation],
      })),
      definitions: raw.definitions.map((definition) => ({
        ...definition,
        citations: [citation],
      })),
      procedures: raw.procedures.map((procedure) => ({
        ...procedure,
        citations: [citation],
      })),
      formulas: raw.formulas.map((formula) => ({
        ...formula,
        citations: [citation],
      })),
      workedExamples: raw.workedExamples,
      notationRules: raw.notationRules,
      rigorSignals: raw.rigorSignals,
      scopeInclusions: raw.scopeInclusions,
      scopeExclusions: raw.scopeExclusions,
      ambiguities: raw.ambiguities,
    });
  } catch (error) {
    console.warn(
      "[learning-material-upload] segment grounding failed; using deterministic fallback",
      {
        traceId: params.traceId ?? null,
        topicId: params.topicId ?? null,
        materialId: params.materialId,
        segmentId: params.segment.segmentId,
        quota: isAiQuotaError(error),
        ...serializeAiError(error),
      },
    );
    return buildFallback();
  }
}

export function buildDeterministicSections(
  groundedSegments: MaterialGroundingSegment[],
  materialId: string,
) {
  const grouped = new Map<
    string,
    { title: string; keyPoints: string[]; citations: GroundingCitation[] }
  >();

  for (const segment of groundedSegments) {
    const title =
      segment.headingPath[0]?.trim() ||
      segment.headingPath[segment.headingPath.length - 1]?.trim() ||
      "Core material";
    const key = normalizeKey(title);
    const entry = grouped.get(key) ?? {
      title,
      keyPoints: [],
      citations: [],
    };

    const points = [
      ...segment.concepts.map((item) => item.name),
      ...segment.definitions.map((item) => item.term),
      ...segment.procedures.map((item) => item.name),
      ...segment.formulas.map((item) => item.label),
      ...segment.workedExamples,
    ];
    entry.keyPoints.push(...points.slice(0, 6));
    entry.citations = mergeCitations(entry.citations, [
      buildCitation({
        materialId,
        segment: {
          segmentId: segment.segmentId,
          order: segment.order,
          pageStart: segment.pageStart,
          pageEnd: segment.pageEnd,
          headingPath: segment.headingPath,
          text: "",
          charCount: 0,
        },
      }),
    ]);
    grouped.set(key, entry);
  }

  return Array.from(grouped.values()).map((section) => {
    const keyPoints = uniqueStrings(section.keyPoints).slice(0, 5);
    return {
      id: nanoid(),
      title: section.title,
      summary: keyPoints.slice(0, 2).join("; "),
      keyPoints,
      citations: section.citations,
    };
  });
}
