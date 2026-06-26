import crypto from "node:crypto";

import { generateText } from "ai";
import { nanoid } from "nanoid";

import { LESSON_MATERIAL_MIME_ALLOWLIST, clampExtractedTextLength } from "@/shared/security/uploads";
import { type MaterialSourceDocument } from "@/features/tutoring/public-server";

import { extractDocxTextLocally } from "./docx-text";
import {
  DOCX_MIME,
  GOOGLE_ANALYSIS_PROVIDER_OPTIONS,
  MATERIAL_EXTRACTION_MAX_RETRIES,
  PDF_MIME,
  getErrorMessage,
  getModelId,
  getResultDiagnostics,
  logLearningMaterialTrace,
  materialAnalysisModel,
} from "./material-analysis-runtime";
import {
  buildSegmentsFromText,
  decodeTextBuffer,
  flattenSourceDocumentText,
  normalizeWhitespace,
} from "./text-processing";

async function extractFileTextWithGemini(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  traceId?: string;
  lessonId?: string;
}) {
  const pageMarkerInstruction =
    params.mimeType.toLowerCase() === PDF_MIME
      ? "Insert a standalone marker [[PAGE N]] each time a new PDF page starts."
      : "Preserve the document structure with clear section headings and list formatting.";

  console.info("[lesson-material-upload] gemini extraction start", {
    traceId: params.traceId ?? null,
    lessonId: params.lessonId ?? null,
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
      functionId: "lesson_material_extraction",
      metadata: {
        traceId: params.traceId ?? "",
        lessonId: params.lessonId ?? "",
        filename: params.filename,
        mimeType: params.mimeType,
      },
    },
  });

  const text = result.text.trim();
  const diagnostics = getResultDiagnostics(result, text.length);

  console.info("[lesson-material-upload] gemini extraction complete", {
    traceId: params.traceId ?? null,
    lessonId: params.lessonId ?? null,
    filename: params.filename,
    extractedTextLength: text.length,
    ...diagnostics,
  });

  logLearningMaterialTrace({
    event: "lesson_material_extraction_complete",
    input: {
      traceId: params.traceId ?? "",
      lessonId: params.lessonId ?? "",
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

export async function extractLearningMaterialSourceDocument(params: {
  materialId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  title?: string | null;
  traceId?: string;
  lessonId?: string;
}) {
  const mime = params.mimeType.toLowerCase();

  if (!LESSON_MATERIAL_MIME_ALLOWLIST.has(mime)) {
    throw new Error("Unsupported lesson material format");
  }

  const sourceHash = crypto.createHash("sha256").update(params.buffer).digest("hex");
  const sourceTitle = params.title?.trim() || params.filename;

  if (mime === "text/plain") {
    console.info("[lesson-material-upload] txt decode", {
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
        "[lesson-material-upload] local docx extraction failed; using gemini fallback",
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
            lessonId: params.lessonId,
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
          lessonId: params.lessonId,
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

  throw new Error("Unsupported lesson material format");
}

export async function extractLearningMaterialText(params: {
  materialId?: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  title?: string | null;
  traceId?: string;
  lessonId?: string;
}) {
  const sourceDocument = await extractLearningMaterialSourceDocument({
    materialId: params.materialId ?? nanoid(),
    buffer: params.buffer,
    filename: params.filename,
    mimeType: params.mimeType,
    title: params.title,
    traceId: params.traceId,
    lessonId: params.lessonId,
  });

  return flattenSourceDocumentText(sourceDocument);
}

export function buildLegacySourceDocument(params: {
  lessonTitle: string;
  materialText: string;
}): MaterialSourceDocument {
  const sourceHash = crypto.createHash("sha256").update(params.materialText).digest("hex");
  return {
    materialId: nanoid(),
    sourceTitle: params.lessonTitle,
    mimeType: "text/plain",
    extractor: "legacy_text_wrapper",
    sourceHash,
    extractedText: params.materialText,
    qualityFlags: ["legacy_wrapper"],
    truncated: false,
    segments: buildSegmentsFromText({
      materialId: nanoid(),
      sourceTitle: params.lessonTitle,
      mimeType: "text/plain",
      extractor: "legacy_text_wrapper",
      sourceHash,
      extractedText: params.materialText,
    }).segments,
  };
}

