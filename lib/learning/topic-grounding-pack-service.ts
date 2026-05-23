import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb } from "@/db";
import { learningTopics } from "@/db/schema";
import { generateStructuredOutput } from "@/lib/ai/runtime";
import { createLogger, serializeError } from "@/lib/logger";
import {
  TOPIC_GROUNDING_PACK_MAX_INPUT_CHARS,
  buildTopicGroundingPackPrompt,
} from "@/lib/learning/prompts/topic-grounding-pack";
import {
  topicGroundingFormulaSchema,
  topicGroundingPackSchema,
  topicGroundingSectionSchema,
  topicSourceBoundarySchema,
  type ContentScopeSnapshot,
  type TopicGroundingPack,
  type TopicSourceBoundary,
} from "@/lib/learning/types";

const log = createLogger("topic-grounding-pack");

const PACK_BUILD_OUTPUT_TOKENS = 4_800;

const topicGroundingPackExtractSchema = topicGroundingPackSchema
  .omit({
    version: true,
    builtAt: true,
    materialIds: true,
    topicTitle: true,
  })
  .extend({
    formulas: z.array(
      topicGroundingFormulaSchema.omit({ id: true }).extend({
        id: z.string().optional(),
      }),
    ),
    sections: z.array(
      topicGroundingSectionSchema.omit({ id: true }).extend({
        id: z.string().optional(),
      }),
    ),
  });

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function mergePackWithBoundary(
  pack: TopicGroundingPack,
  boundary: TopicSourceBoundary,
): TopicGroundingPack {
  return topicGroundingPackSchema.parse({
    ...pack,
    notationRules: uniqueStrings([...pack.notationRules, ...boundary.notationNotes]),
    rigorRules: uniqueStrings([...pack.rigorRules, ...boundary.rigorNotes]),
    scopeRules: uniqueStrings([...pack.scopeRules, ...boundary.scopeNotes]),
  });
}

function buildCombinedSourceText(
  materials: Array<{ title: string; extractedText: string | null }>,
) {
  const parts: string[] = [];
  let total = 0;

  for (const material of materials) {
    const text = material.extractedText?.trim();
    if (!text) continue;

    const header = `\n\n=== SOURCE: ${material.title} ===\n\n`;
    const remaining = TOPIC_GROUNDING_PACK_MAX_INPUT_CHARS - total - header.length;
    if (remaining <= 0) break;

    const chunk = text.slice(0, Math.max(0, remaining));
    parts.push(header, chunk);
    total += header.length + chunk.length;
  }

  return parts.join("").trim();
}

function packToRetrievedContextLines(pack: TopicGroundingPack): string[] {
  const lines: string[] = [];

  if (pack.digest.trim()) {
    lines.push(`Overview: ${pack.digest.trim()}`);
  }

  for (const section of pack.sections) {
    const points =
      section.keyPoints.length > 0
        ? ` Key points: ${section.keyPoints.join("; ")}`
        : "";
    lines.push(`[${section.title}] ${section.summary.trim()}${points}`);
  }

  for (const formula of pack.formulas) {
    lines.push(
      `Formula — ${formula.label}: ${formula.expression}` +
        (formula.conditions ? ` (when: ${formula.conditions})` : ""),
    );
  }

  return lines;
}

export function createEmptyTopicGroundingPack(params: {
  topicTitle: string;
  materialIds?: string[];
  teacherSummary?: string;
}): TopicGroundingPack {
  return topicGroundingPackSchema.parse({
    version: 1,
    builtAt: new Date().toISOString(),
    materialIds: params.materialIds ?? [],
    topicTitle: params.topicTitle,
    digest: params.teacherSummary?.trim() ?? "",
    inScopeConcepts: [],
    explicitlyOutOfScope: [],
    formulas: [],
    sections: [],
    notationRules: [],
    rigorRules: [],
    scopeRules: [],
    teachingNotes: [],
  });
}

export async function rebuildTopicGroundingPack(topicId: string): Promise<TopicGroundingPack | null> {
  const topic = await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, topicId),
    with: {
      materials: {
        orderBy: (table, { asc }) => [asc(table.createdAt)],
      },
    },
  });

  if (!topic) {
    return null;
  }

  const boundary = topicSourceBoundarySchema.parse(topic.sourceBoundary ?? {});
  const indexedMaterials = topic.materials.filter(
    (material) =>
      material.indexingStatus === "completed" && Boolean(material.extractedText?.trim()),
  );
  const materialIds = indexedMaterials.map((material) => material.id);
  const nextVersion = (topic.topicGroundingPack?.version ?? 0) + 1;

  if (indexedMaterials.length === 0) {
    const emptyPack = createEmptyTopicGroundingPack({
      topicTitle: topic.title,
      materialIds: [],
      teacherSummary: boundary.teacherSummary,
    });
    const pack = mergePackWithBoundary(
      { ...emptyPack, version: nextVersion, builtAt: new Date().toISOString() },
      boundary,
    );

    await getDb()
      .update(learningTopics)
      .set({
        topicGroundingPack: pack,
        topicGroundingPackBuiltAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(learningTopics.id, topicId));

    return pack;
  }

  const combinedSourceText = buildCombinedSourceText(indexedMaterials);

  try {
    const extracted = await generateStructuredOutput({
      schema: topicGroundingPackExtractSchema,
      prompt: buildTopicGroundingPackPrompt({
        topicTitle: topic.title,
        topicDescription: topic.description,
        teacherSummary: boundary.teacherSummary,
        learningOutcomes: topic.learningOutcomes ?? [],
        combinedSourceText,
        existingScopeNotes: boundary.scopeNotes,
        existingNotationNotes: boundary.notationNotes,
        existingRigorNotes: boundary.rigorNotes,
      }),
      maxOutputTokens: PACK_BUILD_OUTPUT_TOKENS,
      temperature: 0,
    });

    const pack = mergePackWithBoundary(
      topicGroundingPackSchema.parse({
        ...extracted,
        version: nextVersion,
        builtAt: new Date().toISOString(),
        materialIds,
        topicTitle: topic.title,
        formulas: extracted.formulas.map((formula) => ({
          ...formula,
          id: formula.id?.trim() || nanoid(),
        })),
        sections: extracted.sections.map((section) => ({
          ...section,
          id: section.id?.trim() || nanoid(),
        })),
      }),
      boundary,
    );

    await getDb()
      .update(learningTopics)
      .set({
        topicGroundingPack: pack,
        topicGroundingPackBuiltAt: new Date(),
        updatedAt: new Date(),
        ...(boundary.teacherSummary.trim()
          ? {}
          : pack.digest.trim()
            ? {
                sourceBoundary: {
                  ...boundary,
                  teacherSummary: pack.digest.slice(0, 2_000),
                },
              }
            : {}),
      })
      .where(eq(learningTopics.id, topicId));

    log.info("Topic grounding pack rebuilt", {
      topicId,
      version: pack.version,
      materialCount: materialIds.length,
      formulaCount: pack.formulas.length,
      sectionCount: pack.sections.length,
    });

    return pack;
  } catch (error) {
    log.error("Failed to rebuild topic grounding pack", {
      topicId,
      ...serializeError(error),
    });
    throw error;
  }
}

export function buildContentScopeFromPack(params: {
  topicId: string;
  topicTitle: string;
  contentLocale: string;
  sourceBoundary: TopicSourceBoundary;
  learningOutcomes: Array<{ title: string; description: string }>;
  pack: TopicGroundingPack | null;
  materialIds: string[];
}): ContentScopeSnapshot {
  const boundary = topicSourceBoundarySchema.parse(params.sourceBoundary);
  const pack = params.pack
    ? mergePackWithBoundary(params.pack, boundary)
    : createEmptyTopicGroundingPack({
        topicTitle: params.topicTitle,
        materialIds: params.materialIds,
        teacherSummary: boundary.teacherSummary,
      });

  return {
    topicId: params.topicId,
    topicTitle: params.topicTitle,
    contentLocale: params.contentLocale,
    teacherSummary: boundary.teacherSummary || pack.digest,
    materialIds:
      boundary.allowedMaterialIds.length > 0
        ? boundary.allowedMaterialIds
        : params.materialIds,
    scopeNotes: uniqueStrings([...boundary.scopeNotes, ...pack.scopeRules]),
    notationNotes: uniqueStrings([...boundary.notationNotes, ...pack.notationRules]),
    rigorNotes: uniqueStrings([...boundary.rigorNotes, ...pack.rigorRules]),
    retrievedContext: packToRetrievedContextLines(pack),
    learningOutcomes: params.learningOutcomes,
    groundingPackVersion: pack.version,
    topicGroundingPack: pack,
  };
}
