import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { lessons } from "@/shared/db/schema";
import {
  LEARNING_LIMITS,
  LEARNING_NUMERIC_DEFAULTS,
  LEARNING_STATUS,
} from "@/shared/learning/constants";
import { generateStructuredOutput } from "@/shared/ai/model-generation";
import { createLogger, serializeError } from "@/shared/infra/logger";
import {
  buildLessonGroundingPackPrompt,
} from "@/features/tutoring/server/prompts/lesson-grounding-pack";
import {
  lessonGroundingPackSchema,
  lessonSourceBoundarySchema,
  type LessonGroundingPack,
} from "@/features/tutoring/public-server";

import {
  buildCompiledGroundingText,
  buildDeterministicLessonGroundingPack,
  mergePackWithBoundary,
  lessonGroundingPackExtractSchema,
} from "./core";

const log = createLogger("lesson-grounding-pack");

export function createEmptyLessonGroundingPack(params: {
  lessonTitle: string;
  materialIds?: string[];
  teacherSummary?: string;
}): LessonGroundingPack {
  return lessonGroundingPackSchema.parse({
    version: LEARNING_NUMERIC_DEFAULTS.initialVersion,
    builtAt: new Date().toISOString(),
    materialIds: params.materialIds ?? [],
    lessonTitle: params.lessonTitle,
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

export async function rebuildLessonGroundingPack(lessonId: string): Promise<LessonGroundingPack | null> {
  const lesson = await getDb().query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
    with: {
      materials: {
        orderBy: (table, { asc }) => [asc(table.createdAt)],
      },
    },
  });

  if (!lesson) {
    return null;
  }

  const boundary = lessonSourceBoundarySchema.parse(lesson.sourceBoundary ?? {});
  const allowedMaterialIds = new Set(boundary.allowedMaterialIds);
  const indexedMaterials = lesson.materials.filter((material) => {
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
    (lesson.lessonGroundingPack?.version ?? LEARNING_NUMERIC_DEFAULTS.zero) + 1;

  if (indexedMaterials.length === 0) {
    const emptyPack = createEmptyLessonGroundingPack({
      lessonTitle: lesson.title,
      materialIds: [],
      teacherSummary: boundary.teacherSummary,
    });
    const pack = mergePackWithBoundary(
      { ...emptyPack, version: nextVersion, builtAt: new Date().toISOString() },
      boundary,
    );

    await getDb()
      .update(lessons)
      .set({
        lessonGroundingPack: pack,
        lessonGroundingPackBuiltAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(lessons.id, lessonId));

    return pack;
  }

  const compiledGroundingText = buildCompiledGroundingText(indexedMaterials);

  try {
    const extracted = await generateStructuredOutput({
      schema: lessonGroundingPackExtractSchema,
      prompt: buildLessonGroundingPackPrompt({
        lessonTitle: lesson.title,
        lessonDescription: lesson.description,
        teacherSummary: boundary.teacherSummary,
        learningOutcomes: lesson.learningOutcomes ?? [],
        compiledGroundingText,
        existingScopeNotes: boundary.scopeNotes,
        existingNotationNotes: boundary.notationNotes,
        existingRigorNotes: boundary.rigorNotes,
      }),
      maxOutputTokens: LEARNING_LIMITS.lessonGroundingPackMaxOutputTokens,
      temperature: 0,
    });

    const pack = mergePackWithBoundary(
      lessonGroundingPackSchema.parse({
        ...extracted,
        version: nextVersion,
        builtAt: new Date().toISOString(),
        materialIds,
        lessonTitle: lesson.title,
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
      .update(lessons)
      .set({
        lessonGroundingPack: pack,
        lessonGroundingPackBuiltAt: new Date(),
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
      .where(eq(lessons.id, lessonId));

    log.info("Lesson grounding pack rebuilt", {
      lessonId,
      version: pack.version,
      materialCount: materialIds.length,
      formulaCount: pack.formulas.length,
      sectionCount: pack.sections.length,
    });

    return pack;
  } catch (error) {
    log.error("Failed to rebuild lesson grounding pack", {
      lessonId,
      ...serializeError(error),
    });

    const fallbackPack = buildDeterministicLessonGroundingPack({
      lessonTitle: lesson.title,
      lessonDescription: lesson.description,
      boundary,
      materialIds,
      nextVersion,
      materials: indexedMaterials,
    });

    await getDb()
      .update(lessons)
      .set({
        lessonGroundingPack: fallbackPack,
        lessonGroundingPackBuiltAt: new Date(),
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
      .where(eq(lessons.id, lessonId));

    log.warn("Fell back to deterministic lesson grounding pack", {
      lessonId,
      version: fallbackPack.version,
      materialCount: materialIds.length,
      sectionCount: fallbackPack.sections.length,
      formulaCount: fallbackPack.formulas.length,
    });

    return fallbackPack;
  }
}

