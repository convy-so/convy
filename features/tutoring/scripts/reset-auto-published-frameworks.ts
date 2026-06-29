/**
 * Resets live framework rows that still contain an empty placeholder snapshot.
 *
 *   pnpm exec tsx --env-file=.env features/tutoring/scripts/reset-auto-published-frameworks.ts --dry-run
 *   pnpm exec tsx --env-file=.env features/tutoring/scripts/reset-auto-published-frameworks.ts --apply
 */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { expertFrameworks } from "@/shared/db/schema";

function getFrameworkMarkdownContent(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }

  const markdownContent = (value as Record<string, unknown>).markdownContent;
  return typeof markdownContent === "string" ? markdownContent : "";
}

function isPublishedPlaceholder(framework: unknown): boolean {
  const markdown = getFrameworkMarkdownContent(framework).trim();
  return markdown.length === 0;
}

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
    if (!isPublishedPlaceholder(framework.liveFramework ?? undefined)) {
      continue;
    }

    console.log({
      action: dryRun ? "would-reset" : "reset",
      frameworkId: framework.id,
      frameworkName: framework.draftFramework.name,
    });

    if (!dryRun) {
      await db
        .update(expertFrameworks)
        .set({
          status: "draft",
          liveFramework: null,
          activatedAt: null,
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
