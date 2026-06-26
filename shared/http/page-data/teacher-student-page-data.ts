import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/shared/db";
import {
  classroomStudents,
  studentInteractions,
  studentSessions,
  studentLessonReports,
} from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import {
  resolveTeacherStudentAccess,
} from "@/features/tutoring/server/teacher-route-access";
import { summarizeStudentPatternMemory } from "@/features/tutoring/server/pattern-memory-service";
import type {
  ClassroomStudentOverviewResponse,
  TeacherPatternResponse,
} from "@/features/tutoring/public-client";
import type { QueryAuthContext } from "@/shared/http/page-data/page-data-context";
import { resolveQuerySession } from "@/shared/http/page-data/page-data-context";

export async function getClassroomStudentOverviewData(
  classroomStudentId: string,
): Promise<ClassroomStudentOverviewResponse> {
  const session = await getVerifiedSession();
  const accessResult = await resolveTeacherStudentAccess({
    teacherUserId: session.user.id,
    classroomStudentId,
  });

  if (accessResult.error) {
    throw new Error(accessResult.error === "NOT_FOUND" ? "Student not found" : "Unauthorized");
  }

  const membership = await getDb().query.classroomStudents.findFirst({
    where: eq(classroomStudents.id, classroomStudentId),
    with: {
      classroom: true,
      interestProfile: true,
    },
  });

  if (!membership) {
    throw new Error("Student not found");
  }

  const [reports, tutoringSessions] = await Promise.all([
    getDb().query.studentLessonReports.findMany({
      where: eq(studentLessonReports.classroomStudentId, membership.id),
      with: {
        lesson: true,
      },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 12,
    }),
    getDb().query.studentSessions.findMany({
      where: and(
        eq(studentSessions.classroomStudentId, membership.id),
        eq(studentSessions.sessionType, "tutoring"),
      ),
      with: {
        lesson: true,
      },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 20,
    }),
  ]);
  const tutoringSessionIds = tutoringSessions.map((sessionRow) => sessionRow.id);
  const conversationTurns =
    tutoringSessionIds.length > 0
      ? await getDb().query.studentInteractions.findMany({
          where: and(
            eq(studentInteractions.classroomStudentId, membership.id),
            inArray(studentInteractions.sessionId, tutoringSessionIds),
            inArray(studentInteractions.interactionType, [
              "student_message",
              "tutor_message",
            ]),
          ),
          with: {
            lesson: true,
          },
          orderBy: (table, { asc }) => [asc(table.createdAt)],
        })
      : [];
  const classroomRoster = await getDb().query.classroomStudents.findMany({
    where: eq(classroomStudents.classroomId, membership.classroomId),
    orderBy: (table, { asc }) => [asc(table.fullName)],
    columns: {
      id: true,
      fullName: true,
    },
  });

  const currentStudentIndex = classroomRoster.findIndex(
    (student) => student.id === membership.id,
  );
  const previousStudent =
    currentStudentIndex > 0 ? classroomRoster[currentStudentIndex - 1] : null;
  const nextStudent =
    currentStudentIndex >= 0 && currentStudentIndex < classroomRoster.length - 1
      ? classroomRoster[currentStudentIndex + 1]
      : null;

  return {
    success: true as const,
    data: {
      student: {
        id: membership.id,
        fullName: membership.fullName,
        email: membership.email,
        inviteStatus: membership.inviteStatus,
        onboardingStatus: membership.onboardingStatus,
        profileLastUpdated: membership.interestProfile?.lastRefreshedAt?.toISOString() ?? null,
        classroom: {
          id: membership.classroom.id,
          title: membership.classroom.title,
          gradeBand: membership.classroom.gradeBand,
          gradeLabel: membership.classroom.gradeLabel,
        },
      },
      recentReports: reports.map((report) => ({
        id: report.id,
        lessonId: report.lessonId,
        lessonTitle: report.lesson?.title ?? "Lesson",
        masteryPercent: report.masteryPercent,
        sourceLocale: report.sourceLocale,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        report: report.report,
      })),
      tutoringSessions: tutoringSessions.map((sessionRow) => ({
        id: sessionRow.id,
        lessonId: sessionRow.lessonId,
        lessonTitle: sessionRow.lesson?.title ?? null,
        sessionStatus: sessionRow.sessionStatus,
        sessionLocale: sessionRow.sessionLocale,
        summary: sessionRow.summary ?? null,
        createdAt: sessionRow.createdAt,
        updatedAt: sessionRow.updatedAt,
        completedAt: sessionRow.completedAt,
      })),
      conversationTurns: conversationTurns.flatMap((interaction) =>
        interaction.sessionId
          ? [
              {
                id: interaction.id,
                lessonId: interaction.lessonId,
                lessonTitle: interaction.lesson?.title ?? null,
                sessionId: interaction.sessionId,
                interactionType: interaction.interactionType,
                role: interaction.role,
                content: interaction.content,
                createdAt: interaction.createdAt,
              },
            ]
          : [],
      ),
      navigation: {
        previousStudent: previousStudent
          ? {
              id: previousStudent.id,
              fullName: previousStudent.fullName,
            }
          : null,
        nextStudent: nextStudent
          ? {
              id: nextStudent.id,
              fullName: nextStudent.fullName,
            }
          : null,
        position: currentStudentIndex >= 0 ? currentStudentIndex + 1 : 1,
        totalStudents: classroomRoster.length,
      },
    },
  };
}

export async function getClassroomStudentPatternData(
  classroomStudentId: string,
  authContext?: QueryAuthContext,
): Promise<TeacherPatternResponse> {
  const session = await resolveQuerySession(authContext);
  const accessResult = await resolveTeacherStudentAccess({
    teacherUserId: session.user.id,
    classroomStudentId,
  });

  if (accessResult.error) {
    throw new Error(accessResult.error === "NOT_FOUND" ? "Student not found" : "Unauthorized");
  }

  const membership = await getDb().query.classroomStudents.findFirst({
    where: (table, { eq: eqTable }) => eqTable(table.id, classroomStudentId),
    with: {
      classroom: true,
    },
  });

  if (!membership) {
    throw new Error("Student not found");
  }

  const summary = membership.userId
    ? await summarizeStudentPatternMemory({
        studentUserId: membership.userId,
      })
    : {
        profiles: [],
        memoryState: {
          status: "unavailable" as const,
          message:
            "This student does not have a connected account for long-horizon learning memory yet.",
        },
      };

  return {
    success: true as const,
    data: {
      student: {
        id: membership.id,
        fullName: membership.fullName,
        email: membership.email,
      },
      profiles: summary.profiles,
      memoryState: summary.memoryState,
    },
  };
}

export async function getClassroomStudentReportDetailData(params: {
  classroomStudentId: string;
  reportId: string;
}) {
  const session = await getVerifiedSession();
  const accessResult = await resolveTeacherStudentAccess({
    teacherUserId: session.user.id,
    classroomStudentId: params.classroomStudentId,
  });

  if (accessResult.error) {
    throw new Error(accessResult.error === "NOT_FOUND" ? "Student not found" : "Unauthorized");
  }

  const report = await getDb().query.studentLessonReports.findFirst({
    where: and(
      eq(studentLessonReports.id, params.reportId),
      eq(studentLessonReports.classroomStudentId, params.classroomStudentId),
    ),
    with: {
      lesson: {
        with: {
          course: true,
          classroom: true,
        },
      },
      classroomStudent: {
        with: {
          classroom: true,
        },
      },
    },
  });

  if (!report) {
    throw new Error("Report not found");
  }

  return {
    success: true as const,
    data: {
      id: report.id,
      masteryPercent: report.masteryPercent,
      sourceLocale: report.sourceLocale,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      sessionId: report.generatedFromSessionId,
      lesson: {
        id: report.lessonId,
        title: report.lesson?.title ?? "Lesson",
        courseId: report.lesson?.courseId ?? "",
        courseTitle: report.lesson?.course?.title ?? "Course",
        status: report.lesson?.status ?? "draft",
      },
      student: {
        id: report.classroomStudent.id,
        fullName: report.classroomStudent.fullName,
        email: report.classroomStudent.email,
        classroom: {
          id: report.classroomStudent.classroom.id,
          title: report.classroomStudent.classroom.title,
          gradeBand: report.classroomStudent.classroom.gradeBand,
          gradeLabel: report.classroomStudent.classroom.gradeLabel,
        },
      },
      report: report.report,
    },
  };
}

