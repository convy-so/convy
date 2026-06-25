import { and, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { getDb } from "@/shared/db";
import {
  classroomStudents,
  classrooms,
  learningTopics,
} from "@/shared/db/schema";
import { normalizeAppLocale } from "@/shared/i18n/config";
import {
  LEARNING_STATUS,
  STUDENT_TUTORING_ACCESS_REASON,
} from "@/shared/learning/constants";

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
      course: true,
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
      eq(learningTopics.status, LEARNING_STATUS.topicActive),
    ),
    with: {
      classroom: true,
      course: true,
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

  const universalInterestProfile =
    classroomStudent.interestProfile ??
    (await getUniversalStudentInterestProfile(userId));

  return {
    topic,
    classroomStudent: {
      ...classroomStudent,
      interestProfile: universalInterestProfile,
    },
  };
}

const cachedGetStudentTopicAccess = unstable_cache(
  async (userId: string, topicId: string) => await getStudentTopicAccess(userId, topicId),
  ["learning-student-topic-access"],
  { revalidate: 60 },
);

const cachedGetStudentTutoringAccessState = unstable_cache(
  async (userId: string, topicId: string) =>
    await getStudentTutoringAccessStateImpl(userId, topicId),
  ["learning-student-tutoring-access-state"],
  { revalidate: 60 },
);

export async function getStudentTutoringAccess(userId: string, topicId: string) {
  const result = await cachedGetStudentTutoringAccessState(userId, topicId);
  return result.access;
}

async function getStudentTutoringAccessStateImpl(userId: string, topicId: string) {
  const access = await cachedGetStudentTopicAccess(userId, topicId);
  if (!access) {
    return {
      access: null,
      reason: STUDENT_TUTORING_ACCESS_REASON.TOPIC_UNAVAILABLE,
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

export async function getStudentTutoringAccessState(userId: string, topicId: string) {
  return await cachedGetStudentTutoringAccessState(userId, topicId);
}

export const getTeacherSessionAccess = getTeacherTopicAccess;
export const getStudentSessionAccess = getStudentTopicAccess;

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
