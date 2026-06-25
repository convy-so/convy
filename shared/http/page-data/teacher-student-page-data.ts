import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/shared/db";
import {
  classroomStudents,
  learningInteractions,
  learningSessions,
  studentProgressReports,
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
    getDb().query.studentProgressReports.findMany({
      where: eq(studentProgressReports.classroomStudentId, membership.id),
      with: {
        topic: true,
      },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 12,
    }),
    getDb().query.learningSessions.findMany({
      where: and(
        eq(learningSessions.classroomStudentId, membership.id),
        eq(learningSessions.sessionType, "tutoring"),
      ),
      with: {
        topic: true,
      },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 20,
    }),
  ]);
  const tutoringSessionIds = tutoringSessions.map((sessionRow) => sessionRow.id);
  const conversationTurns =
    tutoringSessionIds.length > 0
      ? await getDb().query.learningInteractions.findMany({
          where: and(
            eq(learningInteractions.classroomStudentId, membership.id),
            inArray(learningInteractions.sessionId, tutoringSessionIds),
            inArray(learningInteractions.interactionType, [
              "student_message",
              "tutor_message",
            ]),
          ),
          with: {
            topic: true,
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
        topicId: report.topicId,
        topicTitle: report.topic?.title ?? "Topic",
        masteryPercent: report.masteryPercent,
        sourceLocale: report.sourceLocale,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        report: report.report,
      })),
      tutoringSessions: tutoringSessions.map((sessionRow) => ({
        id: sessionRow.id,
        topicId: sessionRow.topicId,
        topicTitle: sessionRow.topic?.title ?? null,
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
                topicId: interaction.topicId,
                topicTitle: interaction.topic?.title ?? null,
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

  const report = await getDb().query.studentProgressReports.findFirst({
    where: and(
      eq(studentProgressReports.id, params.reportId),
      eq(studentProgressReports.classroomStudentId, params.classroomStudentId),
    ),
    with: {
      topic: {
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
      topic: {
        id: report.topicId,
        title: report.topic?.title ?? "Topic",
        courseId: report.topic?.courseId ?? "",
        courseTitle: report.topic?.course?.title ?? "Course",
        status: report.topic?.status ?? "draft",
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
