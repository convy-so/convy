import { type LanguageModel } from "ai";
import { flashLiteModel } from "@/shared/ai";
import { logBraintrustTrace } from "@/shared/ai/braintrust";
import { z } from "zod";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PDF_MIME = "application/pdf";

export const MATERIAL_EXTRACTION_MAX_RETRIES = 1;
export const MATERIAL_SEGMENT_MAX_CHARS = 4_800;
export const MATERIAL_SEGMENT_MIN_CHARS = 1_400;
export const MATERIAL_SEGMENT_GROUNDING_CONCURRENCY = 1;
export const MATERIAL_SEGMENT_GROUNDING_OUTPUT_TOKENS = 1_400;
export const MATERIAL_MAP_SYNTHESIS_OUTPUT_TOKENS = 1_200;
export const MATERIAL_COVERAGE_REVIEW_OUTPUT_TOKENS = 2_000;
export const MATERIAL_SEGMENT_GROUNDING_MAX_RETRIES = 0;
export const MATERIAL_REVIEW_MAX_RETRIES = 0;
export const ENABLE_AI_GROUNDING_MAP_SYNTHESIS = true;

export const materialAnalysisModel = flashLiteModel;

export const GOOGLE_ANALYSIS_PROVIDER_OPTIONS = {
  google: {
    structuredOutputs: true,
    thinkingConfig: {
      thinkingBudget: 0,
    },
  },
} as const;

export const rawSegmentGroundingSchema = z.object({
  concepts: z
    .array(
      z.object({
        name: z.string().min(1),
        summary: z.string().default(""),
      }),
    )
    .default([]),
  definitions: z
    .array(
      z.object({
        term: z.string().min(1),
        definition: z.string().default(""),
      }),
    )
    .default([]),
  procedures: z
    .array(
      z.object({
        name: z.string().min(1),
        summary: z.string().default(""),
        steps: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  formulas: z
    .array(
      z.object({
        label: z.string().min(1),
        expression: z.string().min(1),
        conditions: z.string().default(""),
        usageNotes: z.string().default(""),
      }),
    )
    .default([]),
  workedExamples: z.array(z.string()).default([]),
  notationRules: z.array(z.string()).default([]),
  rigorSignals: z.array(z.string()).default([]),
  scopeInclusions: z.array(z.string()).default([]),
  scopeExclusions: z.array(z.string()).default([]),
  ambiguities: z.array(z.string()).default([]),
});

export const materialGroundingSynthesisSchema = z.object({
  overview: z.string().default(""),
  teachingNotes: z.array(z.string()).default([]),
  notationRules: z.array(z.string()).default([]),
  rigorRules: z.array(z.string()).default([]),
  scopeRules: z.array(z.string()).default([]),
  explicitlyOutOfScope: z.array(z.string()).default([]),
});

async function mapWorker<TInput, TOutput>(
  values: TInput[],
  mapper: (value: TInput, index: number) => Promise<TOutput>,
  results: TOutput[],
  cursorRef: { current: number },
) {
  while (cursorRef.current < values.length) {
    const index = cursorRef.current;
    cursorRef.current += 1;
    const value = values[index];
    if (value === undefined) {
      continue;
    }
    results[index] = await mapper(value, index);
  }
}

export async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  concurrency: number,
  mapper: (value: TInput, index: number) => Promise<TOutput>,
) {
  const results = new Array<TOutput>(values.length);
  const cursorRef = { current: 0 };

  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => await mapWorker(values, mapper, results, cursorRef),
  );

  await Promise.all(workers);
  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringProperty(value: unknown, key: string): string | null {
  return isRecord(value) && typeof value[key] === "string"
    ? value[key]
    : null;
}

function getArrayLength(value: unknown, key: string) {
  return isRecord(value) && Array.isArray(value[key])
    ? value[key].length
    : 0;
}

function getUsageSummary(value: unknown) {
  if (!isRecord(value)) {
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    };
  }

  return {
    inputTokens:
      typeof value.inputTokens === "number" ? value.inputTokens : null,
    outputTokens:
      typeof value.outputTokens === "number" ? value.outputTokens : null,
    totalTokens:
      typeof value.totalTokens === "number" ? value.totalTokens : null,
  };
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown AI review error";
}

export function isAiQuotaError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("RESOURCE_EXHAUSTED") ||
    error.message.includes("Quota exceeded") ||
    error.message.includes("current quota") ||
    error.message.includes("rate-limits") ||
    error.message.includes("retry in")
  );
}

export function getModelId(model: LanguageModel) {
  return typeof model === "string" ? model : (model.modelId ?? "unknown_model");
}

export function serializeAiError(error: unknown) {
  if (error instanceof Error) {
    const cause = isRecord(error.cause) ? error.cause : null;

    return {
      errorName: error.name,
      errorMessage: error.message,
      errorCode: getStringProperty(error, "code"),
      causeMessage: cause ? getStringProperty(cause, "message") : null,
      causeCode: cause ? getStringProperty(cause, "code") : null,
    };
  }

  return {
    errorName: "UnknownError",
    errorMessage: String(error),
    errorCode: null,
    causeMessage: null,
    causeCode: null,
  };
}

export function getResultDiagnostics(result: unknown, textLength?: number | null) {
  const response = isRecord(result) ? result.response : null;

  return {
    finishReason: getStringProperty(result, "finishReason"),
    warningCount: getArrayLength(result, "warnings"),
    responseMessageCount: getArrayLength(response, "messages"),
    providerMetadataKeys:
      isRecord(result) && isRecord(result.providerMetadata)
        ? Object.keys(result.providerMetadata).join(",")
        : "",
    ...getUsageSummary(isRecord(result) ? result.usage : null),
    ...(textLength !== undefined && textLength !== null ? { textLength } : {}),
  };
}

export function logLearningMaterialTrace(
  input: Parameters<typeof logBraintrustTrace>[0],
) {
  logBraintrustTrace(input).catch(() => undefined);
}
