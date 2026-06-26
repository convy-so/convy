import { and, eq, lt, or } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { lessonMaterialUploadAttempts } from "@/shared/db/schema";

const DEFAULT_RETENTION_DAYS = 30;

async function main() {
  const retentionDays = Number(process.env.LESSON_MATERIAL_ATTEMPT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const deleted = await getDb()
    .delete(lessonMaterialUploadAttempts)
    .where(
      and(
        or(
          eq(lessonMaterialUploadAttempts.status, "failed"),
          eq(lessonMaterialUploadAttempts.status, "succeeded"),
        ),
        lt(lessonMaterialUploadAttempts.updatedAt, cutoff),
      ),
    )
    .returning({ id: lessonMaterialUploadAttempts.id });

  console.info("[prune-lesson-material-upload-attempts] pruned rows", {
    count: deleted.length,
    retentionDays,
    cutoff: cutoff.toISOString(),
  });
}

main().catch((error) => {
  console.error("[prune-lesson-material-upload-attempts] failed", error);
  process.exit(1);
});

