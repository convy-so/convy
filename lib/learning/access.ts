import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  classroomStudents,
  classrooms,
  learningTopics,
} from "@/db/schema";
import { normalizeAppLocale } from "@/lib/i18n/config";

export type ClassroomTeacherAccessLevel = "owner" | "none";

export async function getTeacherClassroomAccess(
  userId: string,
  classroomId: string,
) {
  const classroom = await getDb().query.classrooms.findFirst({
    where: eq(classrooms.id, classroomId),
  });

  if (!classroom || classroom.teacherUserId !== userId) return null;

  return {
    ...classroom,
    accessLevel: "owner" as const,
  };
}

export async function getPersonalClassroomDirectory(userId: string) {
  const directory = await getDb().query.classrooms.findMany({
    where: eq(classrooms.teacherUserId, userId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    with: {
      students: {
        columns: {
          id: true,
        },
      },
      topics: {
        columns: {
          id: true,
        },
      },
    },
  });

  return directory.map((classroom) => ({
    id: classroom.id,
    title: classroom.title,
    description: classroom.description,
    subject: classroom.subject,
    defaultContentLocale: normalizeAppLocale(classroom.defaultContentLocale),
    gradeBand: classroom.gradeBand,
    gradeLabel: classroom.gradeLabel,
    status: classroom.status,
    teacherUserId: classroom.teacherUserId,
    teacherName: "You",
    accessLevel: "owner" as const,
    accessRequestStatus: null,
    studentCount: classroom.students.length,
    topicCount: classroom.topics.length,
  }));
}

export async function getTeacherTopicAccess(userId: string, topicId: string) {
  const topic = await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, topicId),
    with: {
      classroom: true,
    },
  });

  if (!topic) return null;

  const classroomAccess = await getTeacherClassroomAccess(
    userId,
    topic.classroomId,
  );

  if (!classroomAccess) return null;

  return {
    ...topic,
    classroom: classroomAccess,
  };
}

export async function getStudentTopicAccess(userId: string, topicId: string) {
  const topic = await getDb().query.learningTopics.findFirst({
    where: and(
      eq(learningTopics.id, topicId),
      eq(learningTopics.status, "active"),
    ),
    with: {
      classroom: true,
    },
  });

  if (!topic) return null;

  const classroomStudent = await getDb().query.classroomStudents.findFirst({
    where: and(
      eq(classroomStudents.classroomId, topic.classroomId),
      eq(classroomStudents.userId, userId),
    ),
    with: {
      interestProfile: true,
    },
  });

  if (!classroomStudent) return null;

  return {
    topic,
    classroomStudent,
  };
}

export async function getPrimaryStudentMembership(userId: string) {
  const memberships = await listStudentMemberships(userId);
  return (
    memberships.find((membership) => !membership.interestProfile) ??
    memberships[0] ??
    null
  );
}

export async function listStudentMemberships(userId: string) {
  return await getDb().query.classroomStudents.findMany({
    where: eq(classroomStudents.userId, userId),
    with: {
      classroom: true,
      interestProfile: true,
    },
  });
}
