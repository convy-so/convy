import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { courses } from "@/db/schema";

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
      status: "active",
      createdByUserId: params.createdByUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}
