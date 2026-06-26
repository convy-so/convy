import { and, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { getDb } from "@/shared/db";
import {
  classroomStudents,
  classrooms,
  lessons,
} from "@/shared/db/schema";
import { normalizeAppLocale } from "@/shared/i18n/config";
import {
  TUTORING_STATUS,
  STUDENT_TUTORING_ACCESS_REASON,
} from "@/shared/tutoring/constants";

export type ClassroomTeacherAccessLevel = "owner" | "none";

export function pickUniversalStudentInterestProfile<
  T extends { interestProfile?: { lastRefreshedAt: Date } | null },
>(memberships: T[]) {
  return memberships
    .map((membership) => membership.interestProfile ?? null)
    .filter((profile): profile is NonNullable<T["interestProfile"]> => profile !== null)
    .sort(
      (left, right) =>
        right.lastRefreshedAt.getTime() - left.lastRefreshedAt.getTime(),
    )[0] ?? null;
}

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
      lessons: {
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
    lessonCount: classroom.lessons.length,
  }));
}

export async function getTeacherLessonAccess(userId: string, lessonId: string) {
  const lesson = await getDb().query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
    with: {
      classroom: true,
      course: true,
    },
  });

  if (!lesson) return null;

  const classroomAccess = await getTeacherClassroomAccess(
    userId,
    lesson.classroomId,
  );

  if (!classroomAccess) return null;

  return {
    ...lesson,
    classroom: classroomAccess,
  };
}

export async function getStudentLessonAccess(userId: string, lessonId: string) {
  const lesson = await getDb().query.lessons.findFirst({
    where: and(
      eq(lessons.id, lessonId),
      eq(lessons.status, TUTORING_STATUS.lessonActive),
    ),
    with: {
      classroom: true,
      course: true,
    },
  });

  if (!lesson) return null;

  const classroomStudent = await getDb().query.classroomStudents.findFirst({
    where: and(
      eq(classroomStudents.classroomId, lesson.classroomId),
      eq(classroomStudents.userId, userId),
    ),
    with: {
      interestProfile: true,
    },
  });

  if (!classroomStudent) return null;

  const universalInterestProfile =
    classroomStudent.interestProfile ??
    (await getUniversalStudentInterestProfile(userId));

  return {
    lesson,
    classroomStudent: {
      ...classroomStudent,
      interestProfile: universalInterestProfile,
    },
  };
}

const cachedGetStudentLessonAccess = unstable_cache(
  async (userId: string, lessonId: string) => await getStudentLessonAccess(userId, lessonId),
  ["student-lesson-access"],
  { revalidate: 60 },
);

const cachedGetStudentTutoringAccessState = unstable_cache(
  async (userId: string, lessonId: string) =>
    await getStudentTutoringAccessStateImpl(userId, lessonId),
  ["student-tutoring-access-state"],
  { revalidate: 60 },
);

export async function getStudentTutoringAccess(userId: string, lessonId: string) {
  const result = await cachedGetStudentTutoringAccessState(userId, lessonId);
  return result.access;
}

async function getStudentTutoringAccessStateImpl(userId: string, lessonId: string) {
  const access = await cachedGetStudentLessonAccess(userId, lessonId);
  if (!access) {
    return {
      access: null,
      reason: STUDENT_TUTORING_ACCESS_REASON.LESSON_UNAVAILABLE,
    };
  }

  if (!access.classroomStudent.interestProfile) {
    return {
      access: null,
      reason: STUDENT_TUTORING_ACCESS_REASON.INTEREST_PROFILE_REQUIRED,
    };
  }

  return {
    access,
    reason: null,
  };
}

export async function getStudentTutoringAccessState(userId: string, lessonId: string) {
  return await cachedGetStudentTutoringAccessState(userId, lessonId);
}

export const getTeacherSessionAccess = getTeacherLessonAccess;
export const getStudentSessionAccess = getStudentLessonAccess;

export async function getPrimaryStudentMembership(userId: string) {
  const memberships = await listStudentMemberships(userId);
  return memberships[0] ?? null;
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

export async function getUniversalStudentInterestProfile(userId: string) {
  const memberships = await listStudentMemberships(userId);
  return pickUniversalStudentInterestProfile(memberships);
}


