import { and, desc, eq, ne } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { courses, expertFrameworks } from "@/shared/db/schema";
import type { ExpertFramework } from "@/features/tutoring/server/expert-framework-schemas";
import {
  EXPERT_FRAMEWORK_STATUS_VALUES,
  TUTORING_STATUS,
} from "@/shared/tutoring/constants";

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
  status: (typeof EXPERT_FRAMEWORK_STATUS_VALUES)[number];
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
    draftFramework: row.framework.draftFramework,
    liveFramework: row.framework.liveFramework ?? null,
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
        params?.includeArchived
          ? undefined
          : ne(expertFrameworks.status, TUTORING_STATUS.frameworkArchived),
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

