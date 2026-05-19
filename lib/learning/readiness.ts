import crypto from "crypto";

import { Output, generateText } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { learningTopics } from "@/db/schema";
import { analysisModel } from "@/lib/ai";

export const topicReadinessSchema = z.object({
  ready: z.boolean(),
  summary: z.string(),
  clarifyingQuestions: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
});

export type TopicReadiness = z.infer<typeof topicReadinessSchema>;

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

export function buildReadinessUnavailableFallback(): TopicReadiness {
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

function buildReadinessSourceHash(topic: {
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
        title: topic.title,
        description: topic.description ?? "",
        learningOutcomes: topic.learningOutcomes.map((outcome) => ({
          title: outcome.title,
          description: outcome.description,
        })),
        materials: topic.materials.map((material) => ({
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

export async function getOrGenerateTopicReadiness(topic: {
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
  const sourceHash = buildReadinessSourceHash(topic);
  const persisted =
    topic.readinessAnalysis &&
    topic.readinessSourceHash === sourceHash &&
    topicReadinessSchema.safeParse(topic.readinessAnalysis).success
      ? topicReadinessSchema.parse(topic.readinessAnalysis)
      : null;

  if (persisted) {
    return {
      data: persisted,
      generatedAt:
        topic.readinessGeneratedAt instanceof Date
          ? topic.readinessGeneratedAt.toISOString()
          : topic.readinessGeneratedAt
            ? String(topic.readinessGeneratedAt)
            : null,
      sourceHash,
      cacheStatus: "persisted" as const,
    };
  }

  const materialAnalyses = topic.materials.map((material) => ({
    title: material.title,
    analysis: material.analysis ?? {},
    extractedTextSample: material.extractedText?.slice(0, 4000) ?? "",
  }));

  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: topicReadinessSchema,
    }),
    prompt: `You are helping a teacher decide whether a topic is ready for a grounded AI tutor.

Topic: ${topic.title}
Description: ${topic.description ?? ""}
Learning outcomes:
${topic.learningOutcomes.map((outcome, index) => `${index + 1}. ${outcome.title}: ${outcome.description}`).join("\n")}

Uploaded materials and analyses:
${JSON.stringify(materialAnalyses)}

Rules:
- Mark ready true only if the materials appear sufficient to support the outcomes without large factual gaps.
- Ask clarifying questions only when they are genuinely needed.
- Gaps should focus on missing source material, vague outcomes, or unsupported expectations.`,
  });

  const generatedAt = new Date();
  await getDb()
    .update(learningTopics)
    .set({
      readinessAnalysis: output,
      readinessSourceHash: sourceHash,
      readinessGeneratedAt: generatedAt,
    })
    .where(eq(learningTopics.id, topic.id));

  return {
    data: output,
    generatedAt: generatedAt.toISOString(),
    sourceHash,
    cacheStatus: "generated" as const,
  };
}
