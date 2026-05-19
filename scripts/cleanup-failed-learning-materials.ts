import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { topicMaterials } from "@/db/schema";
import { isMaterialAnalysisFailed } from "@/lib/learning/materials-route-service";
import { deleteLearningMaterial } from "@/lib/storage";

async function main() {
  const materials = await getDb().query.topicMaterials.findMany({
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });

  const failedMaterials = materials.filter(
    (material) =>
      material.extractionStatus === "failed" ||
      material.indexingStatus === "failed" ||
      isMaterialAnalysisFailed(material.analysis),
  );

  console.info("[cleanup-failed-learning-materials] found rows", {
    count: failedMaterials.length,
  });

  for (const material of failedMaterials) {
    if (material.storagePath) {
      try {
        await deleteLearningMaterial(material.storagePath);
      } catch (error) {
        console.warn("[cleanup-failed-learning-materials] storage cleanup failed", {
          materialId: material.id,
          storagePath: material.storagePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await getDb()
      .delete(topicMaterials)
      .where(eq(topicMaterials.id, material.id));

    console.info("[cleanup-failed-learning-materials] deleted material", {
      materialId: material.id,
      topicId: material.topicId,
      title: material.title,
    });
  }
}

main().catch((error) => {
  console.error("[cleanup-failed-learning-materials] failed", error);
  process.exit(1);
});
