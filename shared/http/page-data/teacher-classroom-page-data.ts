import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import { classroomStudents } from "@/shared/db/schema";
import { isTransientDatabaseError } from "@/shared/db/transient-database-errors";
import * as ClassroomService from "@/features/tutoring/server/classroom-service";
import { listCourses } from "@/features/tutoring/server/course-service";
import * as InterventionService from "@/features/tutoring/server/intervention-service";
import { listPendingClassroomInvitations } from "@/features/tutoring/server/student-service";
import { resolveTeacherClassroomAccess } from "@/features/tutoring/server/teacher-route-access";
import { normalizeAppLocale } from "@/shared/i18n/config";
import type { QueryAuthContext } from "@/shared/http/page-data/page-data-context";
import { resolveQuerySession } from "@/shared/http/page-data/page-data-context";

export async function getClassroomStudentsData(
  classroomId: string,
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  const accessResult = await resolveTeacherClassroomAccess({
    teacherUserId: session.user.id,
    classroomId,
  });

  if (accessResult.error === "UNAUTHORIZED") {
    throw new Error("Unauthorized");
  }

  const [students, pendingInvitations] = await Promise.all([
    getDb().query.classroomStudents.findMany({
      where: eq(classroomStudents.classroomId, accessResult.classroom.id),
      with: {
        interestProfile: true,
      },
    }),
    listPendingClassroomInvitations({ classroomId: accessResult.classroom.id }),
  ]);

  return {
    success: true as const,
    data: {
      students: students.map((student) => ({
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        inviteStatus: student.inviteStatus,
        onboardingStatus: student.onboardingStatus,
        profileLastUpdated: student.interestProfile?.profile.lastUpdated ?? null,
      })),
      pendingInvitations: pendingInvitations.map((inv) => ({
        id: inv.id,
        email: inv.invitedEmail,
        expiresAt: inv.expiresAt?.toISOString() ?? null,
        createdAt: inv.createdAt?.toISOString() ?? null,
      })),
    },
  };
}

export async function getTeacherClassroomsData(authContext?: QueryAuthContext) {
  const session = await resolveQuerySession(authContext);
  const data = await ClassroomService.getTeacherClassrooms(session.user.id);
  return { success: true as const, data };
}

export async function getClassroomLessonsData(
  classroomId: string,
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  const accessResult = await resolveTeacherClassroomAccess({
    teacherUserId: session.user.id,
    classroomId,
  });

  if (accessResult.error === "UNAUTHORIZED") {
    throw new Error("Unauthorized");
  }

  return {
    success: true as const,
    data: (await getDb().query.lessons.findMany({
      where: (table, operators) => operators.eq(table.classroomId, classroomId),
      orderBy: (table, operators) => [operators.desc(table.createdAt)],
    })).map((lesson) => ({
      ...lesson,
      contentLocale: normalizeAppLocale(lesson.contentLocale),
    })),
  };
}

export async function getClassroomAssignedSurveysData(
  classroomId: string,
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  let data: Awaited<ReturnType<typeof ClassroomService.getClassroomSurveyProgress>>;

  try {
    data = await ClassroomService.getClassroomSurveyProgress({
      classroomId,
      teacherUserId: session.user.id,
    });
  } catch (error) {
    if (!isTransientDatabaseError(error)) {
      throw error;
    }

    console.warn("[learning] assigned survey progress unavailable", {
      classroomId,
      error: error instanceof Error ? error.message : String(error),
    });
    data = [];
  }

  return {
    success: true as const,
    data,
  };
}

export async function getLessonInterventionsData(
  input: {
    classroomId: string;
    lessonId?: string;
    classroomStudentId?: string;
  },
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  const accessResult = await resolveTeacherClassroomAccess({
    teacherUserId: session.user.id,
    classroomId: input.classroomId,
  });

  if (accessResult.error) {
    throw new Error("Unauthorized");
  }

  const data = await InterventionService.listInterventions({
    classroomId: input.classroomId,
    lessonId: input.lessonId,
    classroomStudentId: input.classroomStudentId,
  });

  return {
    success: true as const,
    data,
  };
}

export async function getTeacherTeachingWorkspaceInitialData(
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  const queryAuthContext = { session };
  const [initialClassrooms, availableCourses] = await Promise.all([
    getTeacherClassroomsData(queryAuthContext),
    listCourses(),
  ]);
  const initialClassroomId = initialClassrooms.data[0]?.id ?? null;

  const [initialStudents, initialLessons] = initialClassroomId
    ? await Promise.all([
        getClassroomStudentsData(initialClassroomId, queryAuthContext),
        getClassroomLessonsData(initialClassroomId, queryAuthContext),
      ])
    : [undefined, undefined];

  return {
    initialClassrooms,
    initialStudents,
    initialLessons,
    availableCourses: availableCourses.map((course) => ({
      id: course.id,
      title: course.title,
    })),
  };
}

