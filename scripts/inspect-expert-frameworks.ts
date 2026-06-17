import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { courses, expertFrameworks } from "@/db/schema";

async function main() {
  const db = getDb();
  const frameworks = await db
    .select({
      frameworkId: expertFrameworks.id,
      name: expertFrameworks.name,
      status: expertFrameworks.status,
      courseTitle: courses.title,
      courseId: expertFrameworks.courseId,
      seedSource: expertFrameworks.seedSource,
      activatedAt: expertFrameworks.activatedAt,
      createdAt: expertFrameworks.createdAt,
    })
    .from(expertFrameworks)
    .innerJoin(courses, eq(expertFrameworks.courseId, courses.id))
    .orderBy(expertFrameworks.createdAt);

  if (frameworks.length === 0) {
    console.log("No expert frameworks found.");
    return;
  }

  for (const framework of frameworks) {
    console.log("---");
    console.log({
      frameworkId: framework.frameworkId,
      name: framework.name,
      courseTitle: framework.courseTitle,
      status: framework.status,
      seedSource: framework.seedSource,
      activatedAt: framework.activatedAt,
      createdAt: framework.createdAt,
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
