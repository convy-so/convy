import { generateText, Output } from "ai";
import { z } from "zod";

import { analysisModel, defaultModel } from "@/lib/ai";
import { getOpenAIClient } from "@/lib/openai";

const materialAnalysisSchema = z.object({
  summary: z.string(),
  clarifyingQuestions: z.array(z.string()).default([]),
  coverageObservations: z.array(z.string()).default([]),
  recommendedOutcomeEdits: z.array(z.string()).default([]),
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

  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml"
  ) {
    return decodeTextBuffer(params.buffer);
  }

  if (mime === "text/html") {
    return stripHtmlTags(decodeTextBuffer(params.buffer));
  }

  if (mime === "application/pdf") {
    return await extractPdfTextWithOpenAI(params);
  }

  // Fall back to the OpenAI file-input path for rich documents we cannot decode locally.
  return await extractPdfTextWithOpenAI(params);
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
    prompt: `Topic: ${params.topicTitle}
Description: ${params.topicDescription ?? ""}
Learning outcomes:
${params.learningOutcomes.map((outcome, index) => `${index + 1}. ${outcome.title}: ${outcome.description}`).join("\n")}

Material excerpt:
${params.materialText.slice(0, 18000)}

You are helping a teacher review whether the uploaded source material is sufficient for a tightly grounded tutor.
- Write a concise summary.
- Ask only necessary clarifying questions.
- Note where the material supports or fails to support the learning outcomes.
- Suggest outcome edits only when the outcomes are too vague or unsupported.`,
  });

  return output;
}

export async function generateMaterialGroundingSummary(params: {
  topicTitle: string;
  materialText: string;
}) {
  const { text } = await generateText({
    model: defaultModel,
    prompt: `Summarize the learning boundaries for the topic "${params.topicTitle}" based only on the source material below in 6 bullet points or fewer.\n\n${params.materialText.slice(0, 16000)}`,
  });

  return text.trim();
}
