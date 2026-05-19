import { generateText, Output } from "ai";
import { z } from "zod";
import { inflateRawSync } from "node:zlib";

import { analysisModel } from "@/lib/ai";
import {
  clampExtractedTextLength,
  LEARNING_MATERIAL_MIME_ALLOWLIST,
} from "@/lib/security/uploads";
import {
  buildMaterialAnalysisPrompt,
} from "@/lib/learning/prompts/materials";

const materialAnalysisSchema = z.object({
  summary: z.string(),
  groundingSummary: z.string(),
  clarifyingQuestions: z.array(z.string()).default([]),
  coverageObservations: z.array(z.string()).default([]),
  recommendedOutcomeEdits: z.array(z.string()).default([]),
  rigorNotes: z.array(z.string()).default([]),
  notationNotes: z.array(z.string()).default([]),
  scopeNotes: z.array(z.string()).default([]),
});

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MATERIAL_ANALYSIS_ATTEMPTS = 3;

export class MaterialAnalysisError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "MaterialAnalysisError";
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown AI review error";
}

function decodeTextBuffer(buffer: Buffer) {
  return buffer.toString("utf8").replace(/\u0000/g, " ").trim();
}

async function extractFileTextWithGemini(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}) {
  console.info("[learning-material-upload] gemini extraction start", {
    filename: params.filename,
    mimeType: params.mimeType,
    byteLength: params.buffer.length,
  });

  const result = await generateText({
    model: analysisModel,
    maxOutputTokens: 6000,
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
              "Extract the educational content from this file into clean Markdown. Preserve important wording, section structure, formulas, lists, definitions, and examples. Omit page numbers, repeated headers, and repeated footers when they are not instructional content. Return only the extracted Markdown text.",
          },
        ],
      },
    ],
  });

  const text = result.text.trim();
  console.info("[learning-material-upload] gemini extraction complete", {
    filename: params.filename,
    extractedTextLength: text.length,
  });

  return text;
}

type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

function findEndOfCentralDirectory(buffer: Buffer) {
  const signature = 0x06054b50;
  const minimumSize = 22;
  const maxCommentLength = 0xffff;
  const start = Math.max(0, buffer.length - minimumSize - maxCommentLength);

  for (let offset = buffer.length - minimumSize; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }

  throw new Error("Invalid DOCX file");
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
    const inflated = inflateRawSync(compressed);
    if (
      entry.uncompressedSize > 0 &&
      inflated.length !== entry.uncompressedSize
    ) {
      return inflated;
    }
    return inflated;
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

export async function extractLearningMaterialText(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}) {
  const mime = params.mimeType.toLowerCase();

  if (!LEARNING_MATERIAL_MIME_ALLOWLIST.has(mime)) {
    throw new Error("Unsupported learning material format");
  }

  if (mime === "text/plain") {
    console.info("[learning-material-upload] txt decode", {
      filename: params.filename,
      byteLength: params.buffer.length,
    });
    return clampExtractedTextLength(decodeTextBuffer(params.buffer));
  }

  if (mime === "application/pdf") {
    return clampExtractedTextLength(await extractFileTextWithGemini(params));
  }

  if (mime === DOCX_MIME) {
    try {
      return clampExtractedTextLength(await extractFileTextWithGemini(params));
    } catch (error) {
      console.warn("[learning-material-upload] gemini docx extraction failed; using local fallback", {
        filename: params.filename,
        error,
      });
      return clampExtractedTextLength(extractDocxTextLocally(params.buffer));
    }
  }

  throw new Error("Unsupported learning material format");
}

export async function analyzeLearningMaterial(params: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  materialText: string;
}) {
  let lastError: unknown = null;
  const prompt = `${buildMaterialAnalysisPrompt(params)}

Also include:
- groundingSummary: a concise teacher-facing summary of what the uploaded material can ground reliably for this topic.
- Return every field required by the schema. Use empty arrays when there is nothing useful to add.
- Do not return prose outside the structured object.`;

  for (let attempt = 1; attempt <= MATERIAL_ANALYSIS_ATTEMPTS; attempt += 1) {
    try {
      console.info("[learning-material-upload] analysis attempt", {
        attempt,
        maxAttempts: MATERIAL_ANALYSIS_ATTEMPTS,
        topicTitle: params.topicTitle,
      });

      const { output } = await generateText({
        model: analysisModel,
        output: Output.object({
          schema: materialAnalysisSchema,
        }),
        maxOutputTokens: 1800,
        maxRetries: 2,
        temperature: 0,
        prompt,
      });

      return output;
    } catch (error) {
      lastError = error;
      console.warn("[learning-material-upload] analysis attempt failed", {
        attempt,
        maxAttempts: MATERIAL_ANALYSIS_ATTEMPTS,
        error: getErrorMessage(error),
      });

      if (attempt < MATERIAL_ANALYSIS_ATTEMPTS) {
        await wait(500 * attempt);
      }
    }
  }

  throw new MaterialAnalysisError(
    `AI material review failed after ${MATERIAL_ANALYSIS_ATTEMPTS} attempts: ${getErrorMessage(lastError)}`,
    MATERIAL_ANALYSIS_ATTEMPTS,
    { cause: lastError },
  );
}
