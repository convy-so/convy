import { generateText, Output } from "ai";
import { z } from "zod";

import { analysisModel, defaultModel } from "@/lib/ai";
import { getOpenAIClient } from "@/lib/openai";
import {
  clampExtractedTextLength,
  LEARNING_MATERIAL_MIME_ALLOWLIST,
} from "@/lib/security/uploads";
import {
  buildMaterialAnalysisPrompt,
  buildMaterialGroundingSummaryPrompt,
} from "@/lib/learning/prompts/materials";

const materialAnalysisSchema = z.object({
  summary: z.string(),
  clarifyingQuestions: z.array(z.string()).default([]),
  coverageObservations: z.array(z.string()).default([]),
  recommendedOutcomeEdits: z.array(z.string()).default([]),
  rigorNotes: z.array(z.string()).default([]),
  notationNotes: z.array(z.string()).default([]),
  scopeNotes: z.array(z.string()).default([]),
});

function stripHtmlTags(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeTextBuffer(buffer: Buffer) {
  return buffer.toString("utf8").replace(/\u0000/g, " ").trim();
}

async function extractPdfTextWithOpenAI(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}) {
  const client = getOpenAIClient();
  const fileData = `data:${params.mimeType};base64,${params.buffer.toString("base64")}`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: params.filename,
            file_data: fileData,
          },
          {
            type: "input_text",
            text:
              "Extract the educational content from this PDF into clean Markdown. Preserve important wording, section structure, formulas, lists, and definitions. Omit page numbers, headers, and footers when they are not instructional content.",
          },
        ],
      },
    ],
  });

  return response.output_text?.trim() ?? "";
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

  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml"
  ) {
    return clampExtractedTextLength(decodeTextBuffer(params.buffer));
  }

  if (mime === "text/html") {
    return clampExtractedTextLength(stripHtmlTags(decodeTextBuffer(params.buffer)));
  }

  if (mime === "application/pdf") {
    return clampExtractedTextLength(await extractPdfTextWithOpenAI(params));
  }

  throw new Error("Unsupported learning material format");
}

export async function analyzeLearningMaterial(params: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  materialText: string;
}) {
  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: materialAnalysisSchema,
    }),
    maxOutputTokens: 1200,
    prompt: buildMaterialAnalysisPrompt(params),
  });

  return output;
}

export async function generateMaterialGroundingSummary(params: {
  topicTitle: string;
  materialText: string;
}) {
  const { text } = await generateText({
    model: defaultModel,
    maxOutputTokens: 500,
    prompt: buildMaterialGroundingSummaryPrompt(params),
  });

  return text.trim();
}
