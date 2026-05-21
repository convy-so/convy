import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { courses, expertFrameworks, learningTopics } from "@/db/schema";

export type FrameworkTopicLite = {
  id: string;
  title: string;
  subjectKey: string;
  classroomId: string;
};

export type FrameworkCourseLite = {
  id: string;
  key: string;
  title: string;
  description: string | null;
};

export type FrameworkWithTopicLite = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  courseId: string;
  classroomId: string | null;
  topicId: string | null;
  name: string;
  description: string | null;
  activeVersionId: string | null;
  archivedAt: Date | null;
  course: FrameworkCourseLite;
  topic: FrameworkTopicLite | null;
};

function mapFrameworkRow(row: {
  framework: typeof expertFrameworks.$inferSelect;
  courseId: string;
  courseKey: string;
  courseTitle: string;
  courseDescription: string | null;
  topicId: string | null;
  topicTitle: string | null;
  topicSubjectKey: string | null;
  topicClassroomId: string | null;
}): FrameworkWithTopicLite {
  return {
    ...row.framework,
    course: {
      id: row.courseId,
      key: row.courseKey,
      title: row.courseTitle,
      description: row.courseDescription,
    },
    topic:
      row.topicId && row.topicTitle && row.topicSubjectKey && row.topicClassroomId
        ? {
            id: row.topicId,
            title: row.topicTitle,
            subjectKey: row.topicSubjectKey,
            classroomId: row.topicClassroomId,
          }
        : null,
  };
}

export async function listFrameworksWithTopicLite() {
  const rows = await getDb()
    .select({
      framework: expertFrameworks,
      courseId: courses.id,
      courseKey: courses.key,
      courseTitle: courses.title,
      courseDescription: courses.description,
      topicId: learningTopics.id,
      topicTitle: learningTopics.title,
      topicSubjectKey: learningTopics.subjectKey,
      topicClassroomId: learningTopics.classroomId,
    })
    .from(expertFrameworks)
    .innerJoin(courses, eq(expertFrameworks.courseId, courses.id))
    .leftJoin(learningTopics, eq(expertFrameworks.topicId, learningTopics.id))
    .orderBy(desc(expertFrameworks.updatedAt));

  return rows.map(mapFrameworkRow);
}

export async function getFrameworkWithTopicLite(frameworkId: string) {
  const [row] = await getDb()
    .select({
      framework: expertFrameworks,
      courseId: courses.id,
      courseKey: courses.key,
      courseTitle: courses.title,
      courseDescription: courses.description,
      topicId: learningTopics.id,
      topicTitle: learningTopics.title,
      topicSubjectKey: learningTopics.subjectKey,
      topicClassroomId: learningTopics.classroomId,
    })
    .from(expertFrameworks)
    .innerJoin(courses, eq(expertFrameworks.courseId, courses.id))
    .leftJoin(learningTopics, eq(expertFrameworks.topicId, learningTopics.id))
    .where(eq(expertFrameworks.id, frameworkId))
    .limit(1);

  return row ? mapFrameworkRow(row) : null;
}
