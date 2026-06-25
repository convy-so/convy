import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { learningTopics } from "@/shared/db/schema";
import {
  LEARNING_LIMITS,
  LEARNING_NUMERIC_DEFAULTS,
  LEARNING_STATUS,
} from "@/shared/learning/constants";
import { generateStructuredOutput } from "@/shared/ai/model-generation";
import { createLogger, serializeError } from "@/shared/infra/logger";
import {
  buildTopicGroundingPackPrompt,
} from "@/features/tutoring/server/prompts/lesson-grounding-pack";
import {
  topicGroundingPackSchema,
  topicSourceBoundarySchema,
  type TopicGroundingPack,
} from "@/features/tutoring/public-server";

import {
  buildCompiledGroundingText,
  buildDeterministicTopicGroundingPack,
  mergePackWithBoundary,
  topicGroundingPackExtractSchema,
} from "./core";

const log = createLogger("topic-grounding-pack");

export function createEmptyTopicGroundingPack(params: {
  topicTitle: string;
  materialIds?: string[];
  teacherSummary?: string;
}): TopicGroundingPack {
  return topicGroundingPackSchema.parse({
    version: LEARNING_NUMERIC_DEFAULTS.initialVersion,
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
  const allowedMaterialIds = new Set(boundary.allowedMaterialIds);
  const indexedMaterials = topic.materials.filter((material) => {
    if (
      material.indexingStatus !== LEARNING_STATUS.materialCompleted ||
      !material.groundingMap
    ) {
      return false;
    }

    if (allowedMaterialIds.size > 0 && !allowedMaterialIds.has(material.id)) {
      return false;
    }

    return true;
  });
  const materialIds = indexedMaterials.map((material) => material.id);
  const nextVersion =
    (topic.topicGroundingPack?.version ?? LEARNING_NUMERIC_DEFAULTS.zero) + 1;

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

  const compiledGroundingText = buildCompiledGroundingText(indexedMaterials);

  try {
    const extracted = await generateStructuredOutput({
      schema: topicGroundingPackExtractSchema,
      prompt: buildTopicGroundingPackPrompt({
        topicTitle: topic.title,
        topicDescription: topic.description,
        teacherSummary: boundary.teacherSummary,
        learningOutcomes: topic.learningOutcomes ?? [],
        compiledGroundingText,
        existingScopeNotes: boundary.scopeNotes,
        existingNotationNotes: boundary.notationNotes,
        existingRigorNotes: boundary.rigorNotes,
      }),
      maxOutputTokens: LEARNING_LIMITS.topicGroundingPackMaxOutputTokens,
      temperature: 0,
    });

    const pack = mergePackWithBoundary(
      topicGroundingPackSchema.parse({
        ...extracted,
        version: nextVersion,
        builtAt: new Date().toISOString(),
        materialIds,
        topicTitle: topic.title,
        conflictNotes: [],
        sourceSummaries: indexedMaterials.map((material) => ({
          materialId: material.id,
          title: material.title,
          overview:
            typeof material.groundingMap?.overview === "string"
              ? material.groundingMap.overview
              : "",
        })),
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

    const fallbackPack = buildDeterministicTopicGroundingPack({
      topicTitle: topic.title,
      topicDescription: topic.description,
      boundary,
      materialIds,
      nextVersion,
      materials: indexedMaterials,
    });

    await getDb()
      .update(learningTopics)
      .set({
        topicGroundingPack: fallbackPack,
        topicGroundingPackBuiltAt: new Date(),
        updatedAt: new Date(),
        ...(boundary.teacherSummary.trim()
          ? {}
          : fallbackPack.digest.trim()
            ? {
                sourceBoundary: {
                  ...boundary,
                  teacherSummary: fallbackPack.digest.slice(0, 2_000),
                },
              }
            : {}),
      })
      .where(eq(learningTopics.id, topicId));

    log.warn("Fell back to deterministic topic grounding pack", {
      topicId,
      version: fallbackPack.version,
      materialCount: materialIds.length,
      sectionCount: fallbackPack.sections.length,
      formulaCount: fallbackPack.formulas.length,
    });

    return fallbackPack;
  }
}
