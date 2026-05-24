import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { learningEvidenceEmbeddings, topicMaterials } from "@/db/schema";
import { isMaterialAnalysisFailed } from "@/lib/learning/materials-route-service";
import { rebuildTopicGroundingPack } from "@/lib/learning/topic-grounding-pack-service";
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

  const affectedTopicIds = new Set<string>();

  for (const material of failedMaterials) {
    affectedTopicIds.add(material.topicId);

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
      .delete(learningEvidenceEmbeddings)
      .where(
        and(
          eq(learningEvidenceEmbeddings.sourceType, "material"),
          eq(learningEvidenceEmbeddings.sourceId, material.id),
        ),
      );

    await getDb()
      .delete(topicMaterials)
      .where(eq(topicMaterials.id, material.id));

    console.info("[cleanup-failed-learning-materials] deleted material", {
      materialId: material.id,
      topicId: material.topicId,
      title: material.title,
    });
  }

  for (const topicId of affectedTopicIds) {
    await rebuildTopicGroundingPack(topicId);
    console.info("[cleanup-failed-learning-materials] rebuilt pack", {
      topicId,
    });
  }
}

main().catch((error) => {
  console.error("[cleanup-failed-learning-materials] failed", error);
  process.exit(1);
});
