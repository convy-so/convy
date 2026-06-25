import { and, eq, lt, or } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { topicMaterialUploadAttempts } from "@/shared/db/schema";

const DEFAULT_RETENTION_DAYS = 30;

async function main() {
  const retentionDays = Number(process.env.LEARNING_MATERIAL_ATTEMPT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const deleted = await getDb()
    .delete(topicMaterialUploadAttempts)
    .where(
      and(
        or(
          eq(topicMaterialUploadAttempts.status, "failed"),
          eq(topicMaterialUploadAttempts.status, "succeeded"),
        ),
        lt(topicMaterialUploadAttempts.updatedAt, cutoff),
      ),
    )
    .returning({ id: topicMaterialUploadAttempts.id });

  console.info("[prune-learning-material-upload-attempts] pruned rows", {
    count: deleted.length,
    retentionDays,
    cutoff: cutoff.toISOString(),
  });
}

main().catch((error) => {
  console.error("[prune-learning-material-upload-attempts] failed", error);
  process.exit(1);
});
