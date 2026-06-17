import { and, desc, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { courses, expertFrameworks } from "@/db/schema";
import type { ExpertFramework } from "@/lib/learning/types";

export type FrameworkCourseLite = {
  id: string;
  title: string;
  description: string | null;
};

export type FrameworkRecord = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  courseId: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "inactive" | "archived";
  seedSource: string;
  draftFramework: ExpertFramework;
  liveFramework: ExpertFramework | null;
  activatedAt: Date | null;
  activatedByUserId: string | null;
  archivedAt: Date | null;
  course: FrameworkCourseLite;
};

function mapFrameworkRow(row: {
  framework: typeof expertFrameworks.$inferSelect;
  courseId: string;
  courseTitle: string;
  courseDescription: string | null;
}): FrameworkRecord {
  return {
    ...row.framework,
    status: row.framework.status as FrameworkRecord["status"],
    draftFramework: row.framework.draftFramework as ExpertFramework,
    liveFramework: (row.framework.liveFramework ?? null) as ExpertFramework | null,
    course: {
      id: row.courseId,
      title: row.courseTitle,
      description: row.courseDescription,
    },
  };
}

export async function listFrameworkRecords(params?: {
  courseId?: string;
  includeArchived?: boolean;
}) {
  const rows = await getDb()
    .select({
      framework: expertFrameworks,
      courseId: courses.id,
      courseTitle: courses.title,
      courseDescription: courses.description,
    })
    .from(expertFrameworks)
    .innerJoin(courses, eq(expertFrameworks.courseId, courses.id))
    .where(
      and(
        params?.courseId ? eq(expertFrameworks.courseId, params.courseId) : undefined,
        params?.includeArchived ? undefined : ne(expertFrameworks.status, "archived"),
      ),
    )
    .orderBy(desc(expertFrameworks.updatedAt));

  return rows.map(mapFrameworkRow);
}

export async function getFrameworkRecord(frameworkId: string) {
  const [row] = await getDb()
    .select({
      framework: expertFrameworks,
      courseId: courses.id,
      courseTitle: courses.title,
      courseDescription: courses.description,
    })
    .from(expertFrameworks)
    .innerJoin(courses, eq(expertFrameworks.courseId, courses.id))
    .where(eq(expertFrameworks.id, frameworkId))
    .limit(1);

  return row ? mapFrameworkRow(row) : null;
}
