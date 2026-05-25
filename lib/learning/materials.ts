import crypto from "node:crypto";
import { inflateRawSync } from "node:zlib";

import { generateText, Output, type LanguageModel } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";

import { flashLiteModel } from "@/lib/ai";
import { logBraintrustTrace } from "@/lib/ai/braintrust";
import {
  buildMaterialCoverageReviewPrompt,
  buildMaterialGroundingMapPrompt,
  buildMaterialSegmentGroundingPrompt,
} from "@/lib/learning/prompts/materials";
import {
  clampExtractedTextLength,
  LEARNING_MATERIAL_MIME_ALLOWLIST,
  MAX_TEXT_EXTRACTION_CHARS,
} from "@/lib/security/uploads";
import {
  materialCoverageReviewSchema,
  materialGroundingMapSchema,
  materialGroundingSegmentSchema,
  materialSourceDocumentSchema,
  materialSourceSegmentSchema,
  type GroundingCitation,
  type MaterialCoverageReview,
  type MaterialGroundingMap,
  type MaterialGroundingSegment,
  type MaterialSourceDocument,
  type MaterialSourceSegment,
} from "@/lib/learning/types";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";

const MATERIAL_EXTRACTION_MAX_RETRIES = 1;
const MATERIAL_SEGMENT_MAX_CHARS = 4_800;
const MATERIAL_SEGMENT_MIN_CHARS = 1_400;
const MATERIAL_SEGMENT_GROUNDING_CONCURRENCY = 1;
const MATERIAL_SEGMENT_GROUNDING_OUTPUT_TOKENS = 1_400;
const MATERIAL_MAP_SYNTHESIS_OUTPUT_TOKENS = 1_200;
const MATERIAL_COVERAGE_REVIEW_OUTPUT_TOKENS = 2_000;
const MATERIAL_SEGMENT_GROUNDING_MAX_RETRIES = 0;
const MATERIAL_REVIEW_MAX_RETRIES = 0;
const ENABLE_AI_GROUNDING_MAP_SYNTHESIS = true;

// This pipeline is high-volume background work, so default to the cheaper model.
const materialAnalysisModel = flashLiteModel;

const GOOGLE_ANALYSIS_PROVIDER_OPTIONS = {
  google: {
    structuredOutputs: true,
    thinkingConfig: {
      thinkingBudget: 0,
    },
  },
} as const;

const rawSegmentGroundingSchema = z.object({
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

const materialGroundingSynthesisSchema = z.object({
  overview: z.string().default(""),
  teachingNotes: z.array(z.string()).default([]),
  notationRules: z.array(z.string()).default([]),
  rigorRules: z.array(z.string()).default([]),
  scopeRules: z.array(z.string()).default([]),
  explicitlyOutOfScope: z.array(z.string()).default([]),
});

type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  concurrency: number,
  mapper: (value: TInput, index: number) => Promise<TOutput>,
) {
  const results = new Array<TOutput>(values.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]!, index);
    }
  });

  await Promise.all(workers);
  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown AI review error";
}

function isAiQuotaError(error: unknown) {
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

function getModelId(model: LanguageModel) {
  return typeof model === "string" ? model : (model.modelId ?? "unknown_model");
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

function serializeAiError(error: unknown) {
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

function getResultDiagnostics(result: unknown, textLength?: number | null) {
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

function logLearningMaterialTrace(input: Parameters<typeof logBraintrustTrace>[0]) {
  logBraintrustTrace(input).catch(() => undefined);
}

function decodeTextBuffer(buffer: Buffer) {
  return buffer.toString("utf8").replace(/\u0000/g, " ").trim();
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function summarizeText(text: string, maxItems: number, maxCharsPerItem = 180) {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) =>
      item.length > maxCharsPerItem
        ? `${item.slice(0, maxCharsPerItem - 1).trim()}...`
        : item,
    )
    .slice(0, maxItems);
}

function extractWorkedExamples(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        /example|worked example|practice|exercise|solve/i.test(line),
    )
    .slice(0, 3);
}

function extractDefinitionCandidates(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(/^([^:]{2,80}):\s+(.{10,})$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .slice(0, 2);
}

function splitIntoBlocks(text: string) {
  return normalizeWhitespace(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function inferHeading(block: string) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  const markdownMatch = firstLine.match(/^(#{1,6})\s+(.+)$/);
  if (markdownMatch) {
    return {
      level: markdownMatch[1].length,
      title: markdownMatch[2].trim(),
      remainingText: lines.slice(1).join("\n").trim(),
    };
  }

  const numberedMatch = firstLine.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
  if (numberedMatch && firstLine.length <= 100) {
    const level = Math.min(numberedMatch[1].split(".").length, 6);
    return {
      level,
      title: numberedMatch[2].trim(),
      remainingText: lines.slice(1).join("\n").trim(),
    };
  }

  if (
    lines.length === 1 &&
    firstLine.length <= 80 &&
    /[A-Za-z]/.test(firstLine) &&
    !/[.!?:]$/.test(firstLine)
  ) {
    return {
      level: 2,
      title: firstLine,
      remainingText: "",
    };
  }

  return null;
}

function applyHeadingPath(
  currentPath: string[],
  level: number,
  title: string,
) {
  const nextPath = currentPath.slice(0, Math.max(0, level - 1));
  nextPath[level - 1] = title;
  return nextPath.filter(Boolean);
}

function parsePdfPageMarker(block: string) {
  const match = block.match(/^\[\[PAGE\s+(\d+)\]\]$/im);
  if (!match) return null;
  return Number.parseInt(match[1] ?? "", 10) || null;
}

function buildSegmentsFromText(params: {
  materialId: string;
  sourceTitle: string;
  mimeType: string;
  extractor: string;
  sourceHash: string;
  extractedText: string;
}) {
  const blocks = splitIntoBlocks(params.extractedText);
  const segments: MaterialSourceSegment[] = [];
  let currentHeadingPath: string[] = [];
  let currentBlocks: string[] = [];
  let currentCharCount = 0;
  let currentPageStart: number | null = null;
  let currentPageEnd: number | null = null;

  const flush = () => {
    const text = normalizeWhitespace(currentBlocks.join("\n\n"));
    if (!text) return;

    segments.push(
      materialSourceSegmentSchema.parse({
        segmentId: nanoid(),
        order: segments.length,
        pageStart: currentPageStart,
        pageEnd: currentPageEnd ?? currentPageStart,
        headingPath: currentHeadingPath,
        text,
        charCount: text.length,
      }),
    );

    currentBlocks = [];
    currentCharCount = 0;
    currentPageStart = currentPageEnd;
  };

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) continue;

    const pageMarker = parsePdfPageMarker(block);
    if (pageMarker) {
      if (currentBlocks.length > 0 && currentPageStart !== null && pageMarker !== currentPageStart) {
        currentPageEnd = currentPageStart;
      }
      if (currentPageStart === null) currentPageStart = pageMarker;
      currentPageEnd = pageMarker;
      continue;
    }

    const heading = inferHeading(block);
    let blockText = block;

    if (heading) {
      if (currentBlocks.length >= 1 && currentCharCount >= MATERIAL_SEGMENT_MIN_CHARS) {
        flush();
      }
      currentHeadingPath = applyHeadingPath(
        currentHeadingPath,
        heading.level,
        heading.title,
      );
      blockText = heading.remainingText;
      if (!blockText) continue;
    }

    const blockLength = blockText.length;
    if (
      currentBlocks.length > 0 &&
      currentCharCount + blockLength > MATERIAL_SEGMENT_MAX_CHARS
    ) {
      flush();
    }

    if (currentPageStart === null) {
      currentPageStart = currentPageEnd;
    }

    currentBlocks.push(blockText);
    currentCharCount += blockLength;
  }

  flush();

  const qualityFlags: string[] = [];
  if (segments.length === 0) qualityFlags.push("no_segments");
  if (segments.some((segment) => !segment.headingPath.length)) {
    qualityFlags.push("weak_heading_structure");
  }

  return materialSourceDocumentSchema.parse({
    materialId: params.materialId,
    sourceTitle: params.sourceTitle,
    mimeType: params.mimeType,
    extractor: params.extractor,
    sourceHash: params.sourceHash,
    extractedText: params.extractedText,
    qualityFlags,
    truncated: params.extractedText.length >= MAX_TEXT_EXTRACTION_CHARS,
    segments,
  });
}

async function extractFileTextWithGemini(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  traceId?: string;
  topicId?: string;
}) {
  const pageMarkerInstruction =
    params.mimeType.toLowerCase() === PDF_MIME
      ? "Insert a standalone marker [[PAGE N]] each time a new PDF page starts."
      : "Preserve the document structure with clear section headings and list formatting.";

  console.info("[learning-material-upload] gemini extraction start", {
    traceId: params.traceId ?? null,
    topicId: params.topicId ?? null,
    filename: params.filename,
    mimeType: params.mimeType,
    byteLength: params.buffer.length,
  });

  const result = await generateText({
    model: materialAnalysisModel,
    maxOutputTokens: 7000,
    maxRetries: MATERIAL_EXTRACTION_MAX_RETRIES,
    temperature: 0,
    providerOptions: GOOGLE_ANALYSIS_PROVIDER_OPTIONS,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "file",
            data: params.buffer,
            filename: params.filename,
            mediaType: params.mimeType,
          },
          {
            type: "text",
            text:
              "Extract the educational content from this file into clean Markdown. " +
              "Preserve important wording, formulas, definitions, worked examples, tables as readable text, and section structure. " +
              `${pageMarkerInstruction} ` +
              "Omit repeated headers, repeated footers, and page-number-only noise. Return only the extracted Markdown text.",
          },
        ],
      },
    ],
    experimental_telemetry: {
      isEnabled: true,
      functionId: "learning_material_extraction",
      metadata: {
        traceId: params.traceId ?? "",
        topicId: params.topicId ?? "",
        filename: params.filename,
        mimeType: params.mimeType,
      },
    },
  });

  const text = result.text.trim();
  const diagnostics = getResultDiagnostics(result, text.length);

  console.info("[learning-material-upload] gemini extraction complete", {
    traceId: params.traceId ?? null,
    topicId: params.topicId ?? null,
    filename: params.filename,
    extractedTextLength: text.length,
    ...diagnostics,
  });

  logLearningMaterialTrace({
    event: "learning_material_extraction_complete",
    input: {
      traceId: params.traceId ?? "",
      topicId: params.topicId ?? "",
      filename: params.filename,
      mimeType: params.mimeType,
      byteLength: params.buffer.length,
    },
    output: {
      extractedTextLength: text.length,
      finishReason: diagnostics.finishReason ?? "",
    },
    metadata: {
      model: getModelId(materialAnalysisModel),
      warningCount: diagnostics.warningCount ?? 0,
      totalTokens: diagnostics.totalTokens ?? 0,
    },
  });

  return text;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error("Invalid DOCX file structure");
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];

  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid DOCX central directory");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry) {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error("Invalid DOCX local file header");
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraFieldLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraFieldLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressed;
  }

  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressed);
  }

  throw new Error("Unsupported DOCX compression method");
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function wordXmlToText(xml: string) {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

function extractDocxTextLocally(buffer: Buffer) {
  const entries = readZipEntries(buffer);
  const documentEntries = entries.filter((entry) =>
    /^word\/(document|footnotes|endnotes|header\d+|footer\d+)\.xml$/i.test(
      entry.name,
    ),
  );

  if (documentEntries.length === 0) {
    throw new Error("DOCX did not contain readable document XML");
  }

  return documentEntries
    .map((entry) => wordXmlToText(readZipEntry(buffer, entry).toString("utf8")))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function flattenSourceDocumentText(sourceDocument: MaterialSourceDocument) {
  return sourceDocument.segments.map((segment) => segment.text).join("\n\n").trim();
}

function buildCitation(params: {
  materialId: string;
  segment: MaterialSourceSegment;
}) {
  const snippet = params.segment.text.slice(0, 280).trim();
  return {
    materialId: params.materialId,
    segmentId: params.segment.segmentId,
    pageStart: params.segment.pageStart,
    pageEnd: params.segment.pageEnd,
    headingPath: params.segment.headingPath,
    snippet,
  } satisfies GroundingCitation;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function mergeCitations(existing: GroundingCitation[], incoming: GroundingCitation[]) {
  const seen = new Set<string>();
  const merged: GroundingCitation[] = [];

  for (const citation of [...existing, ...incoming]) {
    const key = [
      citation.materialId,
      citation.segmentId,
      citation.pageStart ?? "",
      citation.pageEnd ?? "",
      citation.snippet,
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(citation);
  }

  return merged;
}

function collectUniqueObjects<T extends { citations: GroundingCitation[] }>(
  values: T[],
  getKey: (value: T) => string,
) {
  const map = new Map<string, T>();

  for (const value of values) {
    const key = normalizeKey(getKey(value));
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, value);
      continue;
    }

    map.set(key, {
      ...existing,
      ...value,
      citations: mergeCitations(existing.citations, value.citations),
    });
  }

  return Array.from(map.values());
}

async function groundMaterialSegment(params: {
  topicTitle: string;
  materialTitle: string;
  materialId: string;
  segment: MaterialSourceSegment;
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

function buildDeterministicSections(
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

async function synthesizeGroundingMap(params: {
  topicTitle: string;
  materialTitle: string;
  groundedSegments: MaterialGroundingSegment[];
  traceId?: string;
  topicId?: string;
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
    topicTitle: params.topicTitle,
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
      functionId: "learning_material_grounding_map_synthesis",
      metadata: {
        traceId: params.traceId ?? "",
        topicId: params.topicId ?? "",
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

export async function extractLearningMaterialSourceDocument(params: {
  materialId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  title?: string | null;
  traceId?: string;
  topicId?: string;
}) {
  const mime = params.mimeType.toLowerCase();

  if (!LEARNING_MATERIAL_MIME_ALLOWLIST.has(mime)) {
    throw new Error("Unsupported learning material format");
  }

  const sourceHash = crypto
    .createHash("sha256")
    .update(params.buffer)
    .digest("hex");
  const sourceTitle = params.title?.trim() || params.filename;

  if (mime === "text/plain") {
    console.info("[learning-material-upload] txt decode", {
      filename: params.filename,
      byteLength: params.buffer.length,
    });
    const extractedText = clampExtractedTextLength(
      normalizeWhitespace(decodeTextBuffer(params.buffer)),
    );
    return buildSegmentsFromText({
      materialId: params.materialId,
      sourceTitle,
      mimeType: mime,
      extractor: "txt_local",
      sourceHash,
      extractedText,
    });
  }

  if (mime === DOCX_MIME) {
    try {
      const extractedText = clampExtractedTextLength(
        normalizeWhitespace(extractDocxTextLocally(params.buffer)),
      );
      return buildSegmentsFromText({
        materialId: params.materialId,
        sourceTitle,
        mimeType: mime,
        extractor: "docx_local",
        sourceHash,
        extractedText,
      });
    } catch (error) {
      console.warn(
        "[learning-material-upload] local docx extraction failed; using gemini fallback",
        {
          filename: params.filename,
          error: getErrorMessage(error),
        },
      );
      const extractedText = clampExtractedTextLength(
        normalizeWhitespace(
          await extractFileTextWithGemini({
            buffer: params.buffer,
            filename: params.filename,
            mimeType: params.mimeType,
            traceId: params.traceId,
            topicId: params.topicId,
          }),
        ),
      );
      return buildSegmentsFromText({
        materialId: params.materialId,
        sourceTitle,
        mimeType: mime,
        extractor: "docx_gemini_fallback",
        sourceHash,
        extractedText,
      });
    }
  }

  if (mime === PDF_MIME) {
    const extractedText = clampExtractedTextLength(
      normalizeWhitespace(
        await extractFileTextWithGemini({
          buffer: params.buffer,
          filename: params.filename,
          mimeType: params.mimeType,
          traceId: params.traceId,
          topicId: params.topicId,
        }),
      ),
    );
    return buildSegmentsFromText({
      materialId: params.materialId,
      sourceTitle,
      mimeType: mime,
      extractor: "pdf_gemini",
      sourceHash,
      extractedText,
    });
  }

  throw new Error("Unsupported learning material format");
}

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

  const synthesis = ENABLE_AI_GROUNDING_MAP_SYNTHESIS
    ? await synthesizeGroundingMap({
        topicTitle: params.topicTitle,
        materialTitle: params.materialTitle,
        groundedSegments,
        traceId: params.traceId,
        topicId: params.topicId,
        materialId: params.materialId,
      }).catch((error) => {
        console.warn(
          "[learning-material-upload] grounding map synthesis failed; using fallback",
          {
            traceId: params.traceId ?? null,
            topicId: params.topicId ?? null,
            materialId: params.materialId,
            quota: isAiQuotaError(error),
            ...serializeAiError(error),
          },
        );
        return buildGroundingMapFallback({
          groundedSegments,
          sections,
        });
      })
    : buildGroundingMapFallback({
        groundedSegments,
        sections,
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

export async function extractLearningMaterialText(params: {
  materialId?: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  title?: string | null;
  traceId?: string;
  topicId?: string;
}) {
  const sourceDocument = await extractLearningMaterialSourceDocument({
    materialId: params.materialId ?? nanoid(),
    buffer: params.buffer,
    filename: params.filename,
    mimeType: params.mimeType,
    title: params.title,
    traceId: params.traceId,
    topicId: params.topicId,
  });

  return flattenSourceDocumentText(sourceDocument);
}

export async function analyzeLearningMaterial(params: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  materialText: string;
}) {
  const sourceDocument = materialSourceDocumentSchema.parse({
    materialId: nanoid(),
    sourceTitle: params.topicTitle,
    mimeType: "text/plain",
    extractor: "legacy_text_wrapper",
    sourceHash: crypto.createHash("sha256").update(params.materialText).digest("hex"),
    extractedText: params.materialText,
    qualityFlags: ["legacy_wrapper"],
    truncated: params.materialText.length >= MAX_TEXT_EXTRACTION_CHARS,
    segments: buildSegmentsFromText({
      materialId: nanoid(),
      sourceTitle: params.topicTitle,
      mimeType: "text/plain",
      extractor: "legacy_text_wrapper",
      sourceHash: crypto.createHash("sha256").update(params.materialText).digest("hex"),
      extractedText: params.materialText,
    }).segments,
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
