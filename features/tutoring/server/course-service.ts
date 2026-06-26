import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { courses } from "@/shared/db/schema";
import { TUTORING_STATUS } from "@/shared/tutoring/constants";

export async function listCourses() {
  return await getDb().query.courses.findMany({
    orderBy: [asc(courses.title)],
  });
}

export async function getCourseById(courseId: string) {
  return await getDb().query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
}

export async function createCourse(params: {
  title: string;
  description?: string;
  createdByUserId: string;
}) {
  const [created] = await getDb()
    .insert(courses)
    .values({
      id: nanoid(),
      title: params.title,
      description: params.description || null,
      status: TUTORING_STATUS.courseActive,
      createdByUserId: params.createdByUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

