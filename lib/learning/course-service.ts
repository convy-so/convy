import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { courses } from "@/db/schema";

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

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

export async function getCourseByKey(key: string) {
  return await getDb().query.courses.findFirst({
    where: eq(courses.key, key),
  });
}

export async function createCourse(params: {
  title: string;
  description?: string;
  createdByUserId: string;
}) {
  const baseKey = slugify(params.title);
  let key = baseKey;
  let counter = 1;
  
  while (await getCourseByKey(key)) {
    key = `${baseKey}-${counter}`;
    counter++;
  }

  const [created] = await getDb()
    .insert(courses)
    .values({
      id: nanoid(),
      key,
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
