/**
 * Resets live framework rows that still contain an auto-seeded placeholder snapshot.
 *
 *   pnpm exec tsx --env-file=.env scripts/reset-auto-published-frameworks.ts --dry-run
 *   pnpm exec tsx --env-file=.env scripts/reset-auto-published-frameworks.ts --apply
 */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { expertFrameworks } from "@/db/schema";
import { isAutoSeededPublishedPlaceholder } from "@/lib/learning/framework-live-version";
import type { ExpertFramework } from "@/lib/learning/types";

function readFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const dryRun = readFlag("dry-run") || !readFlag("apply");
  const db = getDb();

  const frameworks = await db.query.expertFrameworks.findMany({
    where: and(
      eq(expertFrameworks.status, "active"),
    ),
  });

  let resetCount = 0;

  for (const framework of frameworks) {
    if (
      !isAutoSeededPublishedPlaceholder({
        seedSource: framework.seedSource,
        framework: (framework.liveFramework ?? undefined) as ExpertFramework | undefined,
      })
    ) {
      continue;
    }

    console.log({
      action: dryRun ? "would-reset" : "reset",
      frameworkId: framework.id,
      frameworkName: framework.name,
    });

    if (!dryRun) {
      await db
        .update(expertFrameworks)
        .set({
          status: "draft",
          liveFramework: null,
          activatedAt: null,
          activatedByUserId: null,
          updatedAt: new Date(),
        })
        .where(eq(expertFrameworks.id, framework.id));
    }

    resetCount += 1;
  }

  if (resetCount === 0) {
    console.log("No active placeholder frameworks found.");
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
