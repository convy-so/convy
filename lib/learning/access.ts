import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  classroomAccessRequests,
  classroomStudents,
  classrooms,
  classroomTeacherAccess,
  learningTopics,
} from "@/db/schema";
import { normalizeAppLocale } from "@/lib/i18n/config";
import { isWorkspaceMember } from "@/lib/workspace-access";

export type ClassroomTeacherAccessLevel = "owner" | "collaborator" | "none";

export async function getTeacherClassroomAccess(
  userId: string,
  classroomId: string,
) {
  const classroom = await getDb().query.classrooms.findFirst({
    where: eq(classrooms.id, classroomId),
    with: {
      department: {
        columns: {
          id: true,
          name: true,
        },
      },
      teacher: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      teacherAccess: {
        where: eq(classroomTeacherAccess.teacherUserId, userId),
      },
    },
  });

  if (!classroom) return null;

  const accessRecord = classroom.teacherAccess[0] ?? null;
  const derivedAccessLevel: ClassroomTeacherAccessLevel =
    accessRecord?.accessLevel === "owner" || accessRecord?.accessLevel === "collaborator"
      ? accessRecord.accessLevel
      : classroom.teacherUserId === userId
        ? "owner"
        : "none";

  if (derivedAccessLevel === "none") {
    return null;
  }

  return {
    ...classroom,
    accessLevel: derivedAccessLevel,
  };
}

export async function getWorkspaceClassroomDirectory(
  userId: string,
  organizationId: string,
) {
  const isMember = await isWorkspaceMember(userId, organizationId);
  if (!isMember) {
    return [];
  }

  const directory = await getDb().query.classrooms.findMany({
    where: eq(classrooms.organizationId, organizationId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    with: {
      department: {
        columns: {
          id: true,
          name: true,
        },
      },
      teacher: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      teacherAccess: true,
      accessRequests: {
        where: and(
          eq(classroomAccessRequests.requesterUserId, userId),
          eq(classroomAccessRequests.status, "pending"),
        ),
      },
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

  return directory.map((classroom) => {
    const accessRecord = classroom.teacherAccess.find(
      (record) => record.teacherUserId === userId,
    );
    const accessLevel: ClassroomTeacherAccessLevel =
      accessRecord?.accessLevel === "owner" || accessRecord?.accessLevel === "collaborator"
        ? accessRecord.accessLevel
        : classroom.teacherUserId === userId
          ? "owner"
          : "none";

    return {
      id: classroom.id,
      title: classroom.title,
      description: classroom.description,
      subject: classroom.subject,
      defaultContentLocale: normalizeAppLocale(classroom.defaultContentLocale),
      departmentId: classroom.department?.id ?? null,
      departmentName: classroom.department?.name ?? null,
      gradeBand: classroom.gradeBand,
      gradeLabel: classroom.gradeLabel,
      status: classroom.status,
      teacherUserId: classroom.teacherUserId,
      teacherName: classroom.teacher.name || classroom.teacher.email,
      accessLevel,
      accessRequestStatus: classroom.accessRequests[0]?.status ?? null,
      studentCount: classroom.students.length,
      topicCount: classroom.topics.length,
    };
  });
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
