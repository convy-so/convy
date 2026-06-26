import crypto from "crypto";

import { Output, generateText } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { lessons } from "@/shared/db/schema";
import { analysisModel } from "@/shared/ai";

export const lessonReadinessSchema = z.object({
  ready: z.boolean(),
  summary: z.string(),
  clarifyingQuestions: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
});

export type LessonReadiness = z.infer<typeof lessonReadinessSchema>;

export function isReadinessQuotaError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("RESOURCE_EXHAUSTED") ||
    error.message.includes("Quota exceeded") ||
    error.message.includes("current quota") ||
    error.message.includes("rate-limits")
  );
}

export function buildReadinessUnavailableFallback(): LessonReadiness {
  return {
    ready: false,
    summary:
      "Readiness analysis is temporarily unavailable because the AI quota for this workspace has been exhausted.",
    clarifyingQuestions: [],
    gaps: [
      "AI readiness analysis is temporarily unavailable. Review outcomes and source materials manually for now.",
    ],
    strengths: [],
  };
}

function buildReadinessSourceHash(lesson: {
  title: string;
  description?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  materials: Array<{
    id: string;
    title: string;
    updatedAt?: Date | string | null;
    analysis?: Record<string, unknown> | null;
    extractedText?: string | null;
  }>;
}) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        title: lesson.title,
        description: lesson.description ?? "",
        learningOutcomes: lesson.learningOutcomes.map((outcome) => ({
          title: outcome.title,
          description: outcome.description,
        })),
        materials: lesson.materials.map((material) => ({
          id: material.id,
          title: material.title,
          updatedAt:
            material.updatedAt instanceof Date
              ? material.updatedAt.toISOString()
              : material.updatedAt ?? null,
          analysis: material.analysis ?? {},
          extractedTextSample: material.extractedText?.slice(0, 1000) ?? "",
        })),
      }),
    )
    .digest("hex");
}

export async function getOrGenerateLessonReadiness(lesson: {
  id: string;
  title: string;
  description?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  materials: Array<{
    id: string;
    title: string;
    updatedAt?: Date | string | null;
    analysis?: Record<string, unknown> | null;
    extractedText?: string | null;
  }>;
  readinessAnalysis?: Record<string, unknown> | null;
  readinessSourceHash?: string | null;
  readinessGeneratedAt?: Date | string | null;
}) {
  const sourceHash = buildReadinessSourceHash(lesson);
  const persisted =
    lesson.readinessAnalysis &&
    lesson.readinessSourceHash === sourceHash &&
    lessonReadinessSchema.safeParse(lesson.readinessAnalysis).success
      ? lessonReadinessSchema.parse(lesson.readinessAnalysis)
      : null;

  if (persisted) {
    return {
      data: persisted,
      generatedAt:
        lesson.readinessGeneratedAt instanceof Date
          ? lesson.readinessGeneratedAt.toISOString()
          : lesson.readinessGeneratedAt
            ? String(lesson.readinessGeneratedAt)
            : null,
      sourceHash,
      cacheStatus: "persisted" as const,
    };
  }

  const materialAnalyses = lesson.materials.map((material) => ({
    title: material.title,
    analysis: material.analysis ?? {},
    extractedTextSample: material.extractedText?.slice(0, 4000) ?? "",
  }));

  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: lessonReadinessSchema,
    }),
    prompt: `You are helping a teacher decide whether a lesson is ready for a grounded AI tutor.

Lesson: ${lesson.title}
Description: ${lesson.description ?? ""}
Learning outcomes:
${lesson.learningOutcomes.map((outcome, index) => `${index + 1}. ${outcome.title}: ${outcome.description}`).join("\n")}

Uploaded materials and analyses:
${JSON.stringify(materialAnalyses)}

Rules:
- Mark ready true only if the materials appear sufficient to support the outcomes without large factual gaps.
- Ask clarifying questions only when they are genuinely needed.
- Gaps should focus on missing source material, vague outcomes, or unsupported expectations.`,
  });

  const generatedAt = new Date();
  await getDb()
    .update(lessons)
    .set({
      readinessAnalysis: output,
      readinessSourceHash: sourceHash,
      readinessGeneratedAt: generatedAt,
    })
    .where(eq(lessons.id, lesson.id));

  return {
    data: output,
    generatedAt: generatedAt.toISOString(),
    sourceHash,
    cacheStatus: "generated" as const,
  };
}

