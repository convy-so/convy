/**
 * Unpublishes auto-seeded DEEP placeholder versions that were marked live without expert content.
 *
 *   pnpm exec tsx --env-file=.env scripts/reset-auto-published-frameworks.ts --dry-run
 *   pnpm exec tsx --env-file=.env scripts/reset-auto-published-frameworks.ts --apply
 */
import { eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db";
import { expertFrameworks, expertFrameworkVersions } from "@/db/schema";
import { isAutoSeededPublishedPlaceholder } from "@/lib/learning/framework-live-version";
import type { ExpertFramework } from "@/lib/learning/types";

function readFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const dryRun = readFlag("dry-run") || !readFlag("apply");
  const db = getDb();

  const frameworks = await db.query.expertFrameworks.findMany({
    where: isNotNull(expertFrameworks.activeVersionId),
  });

  let resetCount = 0;

  for (const framework of frameworks) {
    const versions = await db.query.expertFrameworkVersions.findMany({
      where: eq(expertFrameworkVersions.frameworkId, framework.id),
    });

    const activeVersion = versions.find((version) => version.id === framework.activeVersionId);
    if (!activeVersion || activeVersion.status !== "published") {
      continue;
    }

    if (
      !isAutoSeededPublishedPlaceholder({
        seedSource: activeVersion.seedSource,
        framework: activeVersion.framework as ExpertFramework,
      })
    ) {
      continue;
    }

    console.log({
      action: dryRun ? "would-reset" : "reset",
      frameworkId: framework.id,
      frameworkName: framework.name,
      versionId: activeVersion.id,
      versionNumber: activeVersion.version,
    });

    if (!dryRun) {
      await db.transaction(async (tx) => {
        await tx
          .update(expertFrameworkVersions)
          .set({
            status: "draft",
            publishedAt: null,
            publishedByUserId: null,
            updatedAt: new Date(),
          })
          .where(eq(expertFrameworkVersions.id, activeVersion.id));

        await tx
          .update(expertFrameworks)
          .set({
            activeVersionId: null,
            updatedAt: new Date(),
          })
          .where(eq(expertFrameworks.id, framework.id));
      });
    }

    resetCount += 1;
  }

  if (resetCount === 0) {
    console.log("No auto-published placeholder frameworks found.");
    return;
  }

  console.log(
    dryRun
      ? `Found ${resetCount} framework(s). Re-run with --apply to reset.`
      : `Reset ${resetCount} framework(s).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
