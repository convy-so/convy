import { and, eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { lessonEvidenceEmbeddings, lessonMaterials } from "@/shared/db/schema";
import { isMaterialAnalysisFailed } from "@/features/tutoring/server/materials-route-service";
import { rebuildLessonGroundingPack } from "@/features/tutoring/server/lesson-grounding-pack-service";
import { deleteLessonMaterial } from "@/shared/infra/supabase-storage";

async function main() {
  const materials = await getDb().query.lessonMaterials.findMany({
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });

  const failedMaterials = materials.filter(
    (material) =>
      material.extractionStatus === "failed" ||
      material.indexingStatus === "failed" ||
      isMaterialAnalysisFailed(material.analysis),
  );

  console.info("[cleanup-failed-lesson-materials] found rows", {
    count: failedMaterials.length,
  });

  const affectedLessonIds = new Set<string>();

  for (const material of failedMaterials) {
    affectedLessonIds.add(material.lessonId);

    if (material.storagePath) {
      try {
        await deleteLessonMaterial(material.storagePath);
      } catch (error) {
        console.warn("[cleanup-failed-lesson-materials] storage cleanup failed", {
          materialId: material.id,
          storagePath: material.storagePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await getDb()
      .delete(lessonEvidenceEmbeddings)
      .where(
        and(
          eq(lessonEvidenceEmbeddings.sourceType, "material"),
          eq(lessonEvidenceEmbeddings.sourceId, material.id),
        ),
      );

    await getDb()
      .delete(lessonMaterials)
      .where(eq(lessonMaterials.id, material.id));

    console.info("[cleanup-failed-lesson-materials] deleted material", {
      materialId: material.id,
      lessonId: material.lessonId,
      title: material.title,
    });
  }

  for (const lessonId of affectedLessonIds) {
    await rebuildLessonGroundingPack(lessonId);
    console.info("[cleanup-failed-lesson-materials] rebuilt pack", {
      lessonId,
    });
  }
}

main().catch((error) => {
  console.error("[cleanup-failed-lesson-materials] failed", error);
  process.exit(1);
});

