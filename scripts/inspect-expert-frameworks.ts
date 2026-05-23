import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  courses,
  expertFrameworks,
  expertFrameworkVersions,
  expertRuntimeModels,
} from "@/db/schema";

async function main() {
  const db = getDb();
  const frameworks = await db
    .select({
      frameworkId: expertFrameworks.id,
      name: expertFrameworks.name,
      activeVersionId: expertFrameworks.activeVersionId,
      courseTitle: courses.title,
      courseId: expertFrameworks.courseId,
      topicId: expertFrameworks.topicId,
      createdAt: expertFrameworks.createdAt,
    })
    .from(expertFrameworks)
    .innerJoin(courses, eq(expertFrameworks.courseId, courses.id))
    .orderBy(expertFrameworks.createdAt);

  if (frameworks.length === 0) {
    console.log("No expert frameworks found.");
    return;
  }

  const frameworkIds = frameworks.map((row) => row.frameworkId);
  const versions = await db.query.expertFrameworkVersions.findMany({
    where: inArray(expertFrameworkVersions.frameworkId, frameworkIds),
  });
  const runtimeModels = await db.query.expertRuntimeModels.findMany({
    where: inArray(expertRuntimeModels.frameworkId, frameworkIds),
  });

  for (const framework of frameworks) {
    const frameworkVersions = versions.filter(
      (version) => version.frameworkId === framework.frameworkId,
    );
    const activeVersion = frameworkVersions.find(
      (version) => version.id === framework.activeVersionId,
    );
    const publishedVersions = frameworkVersions.filter(
      (version) => version.status === "published",
    );
    const runtimes = runtimeModels.filter(
      (model) => model.frameworkId === framework.frameworkId,
    );

    console.log("---");
    console.log({
      frameworkId: framework.frameworkId,
      name: framework.name,
      courseTitle: framework.courseTitle,
      activeVersionId: framework.activeVersionId,
      activeVersionStatus: activeVersion?.status ?? null,
      activeVersionSeed: activeVersion?.seedSource ?? null,
      versionCount: frameworkVersions.length,
      publishedVersionCount: publishedVersions.length,
      runtimeModelCount: runtimes.length,
      uiWouldShowLive: Boolean(
        activeVersion && activeVersion.status === "published",
      ),
      uiShowsLiveBug: Boolean(
        framework.activeVersionId &&
          (!activeVersion || activeVersion.status !== "published"),
      ),
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
