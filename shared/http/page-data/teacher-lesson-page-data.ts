import { and, count, eq, isNull, ne } from "drizzle-orm";

import { getDb } from "@/shared/db";
import {
  classroomStudents,
  studentInteractions,
  studentLessonReports,
  lessonMaterials,
} from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getTeacherLessonAccess } from "@/features/tutoring/server/access";
import { buildClassroomLessonReportSummary } from "@/features/tutoring/server/reporting";
import { getLessonWithMaterials } from "@/features/tutoring/public-server";
import { isMaterialAnalysisFailed } from "@/features/tutoring/server/materials-route-service";
import {
  buildReadinessUnavailableFallback,
  getOrGenerateLessonReadiness,
  isReadinessQuotaError,
} from "@/features/tutoring/server/readiness";
import { normalizeAppLocale, type AppLocale } from "@/shared/i18n/config";
import type { LessonOverviewResponse } from "@/features/tutoring/public-client";
import type { QueryAuthContext } from "@/shared/http/page-data/page-data-context";
import { resolveQuerySession } from "@/shared/http/page-data/page-data-context";

function toOptionalAppLocale(value: string | null | undefined): AppLocale | undefined {
  return value ? normalizeAppLocale(value) : undefined;
}

export async function getLessonOverviewData(lessonId: string): Promise<LessonOverviewResponse> {
  const session = await getVerifiedSession();
  const lesson = await getTeacherLessonAccess(session.user.id, lessonId);

  if (!lesson) {
    throw new Error("Unauthorized");
  }

  const [reportCountResult, questionCountResult, activeStudentCountResult] = await Promise.all([
    getDb()
      .select({ value: count() })
      .from(studentLessonReports)
      .where(eq(studentLessonReports.lessonId, lessonId)),
    getDb()
      .select({ value: count() })
      .from(studentInteractions)
      .where(
        and(
          eq(studentInteractions.lessonId, lessonId),
          isNull(studentInteractions.sessionId),
          eq(studentInteractions.interactionType, "out_of_session_question"),
        ),
      ),
    getDb()
      .select({ value: count() })
      .from(classroomStudents)
      .where(
        and(
          eq(classroomStudents.classroomId, lesson.classroomId),
          eq(classroomStudents.inviteStatus, "accepted"),
        ),
      ),
  ]);

  return {
    success: true as const,
    data: {
      lesson: {
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        courseId: lesson.courseId,
        courseTitle: lesson.course.title,
        contentLocale: toOptionalAppLocale(lesson.contentLocale),
        status: lesson.status,
        classroom: {
          id: lesson.classroom.id,
          title: lesson.classroom.title,
          gradeBand: lesson.classroom.gradeBand,
          gradeLabel: lesson.classroom.gradeLabel,
        },
      },
      reportCount: reportCountResult[0]?.value ?? 0,
      questionCount: questionCountResult[0]?.value ?? 0,
      activeStudentCount: activeStudentCountResult[0]?.value ?? 0,
    },
  };
}

export async function getLessonSetupData(lessonId: string) {
  const session = await getVerifiedSession();
  const lesson = await getTeacherLessonAccess(session.user.id, lessonId);

  if (!lesson) {
    throw new Error("Unauthorized");
  }

  return {
    success: true as const,
    data: {
      lesson: {
        id: lesson.id,
        classroomId: lesson.classroomId,
        title: lesson.title,
        description: lesson.description ?? "",
        courseId: lesson.courseId,
        courseTitle: lesson.course.title,
        contentLocale: toOptionalAppLocale(lesson.contentLocale) ?? "en",
        status: lesson.status,
        learningOutcomes: lesson.learningOutcomes,
        sourceBoundary: lesson.sourceBoundary,
      },
      classroom: {
        id: lesson.classroom.id,
        title: lesson.classroom.title,
      },
    },
  };
}

export async function getLessonReportsData(
  lessonId: string,
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  const lesson = await getTeacherLessonAccess(session.user.id, lessonId);

  if (!lesson) {
    throw new Error("Unauthorized");
  }

  const reports = await getDb().query.studentLessonReports.findMany({
    where: eq(studentLessonReports.lessonId, lessonId),
    with: {
      classroomStudent: true,
    },
    orderBy: (table, operators) => [operators.desc(table.updatedAt)],
  });

  const serializedReports = reports.map((report) => ({
    id: report.id,
    sessionId: report.generatedFromSessionId,
    masteryPercent: report.masteryPercent,
    sourceLocale: report.sourceLocale,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    student: {
      id: report.classroomStudent.id,
      fullName: report.classroomStudent.fullName,
      email: report.classroomStudent.email,
    },
    report: report.report,
  }));

  return {
    success: true as const,
    data: {
      reports: serializedReports,
      summary: buildClassroomLessonReportSummary(serializedReports),
    },
  };
}

export async function getLessonQuestionsData(
  lessonId: string,
  classroomStudentId?: string,
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  const lesson = await getTeacherLessonAccess(session.user.id, lessonId);

  if (!lesson) {
    throw new Error("Unauthorized");
  }

  const interactions = await getDb().query.studentInteractions.findMany({
    where: classroomStudentId
      ? and(
          eq(studentInteractions.lessonId, lessonId),
          isNull(studentInteractions.sessionId),
          eq(studentInteractions.classroomStudentId, classroomStudentId),
        )
      : and(
          eq(studentInteractions.lessonId, lessonId),
          isNull(studentInteractions.sessionId),
        ),
    with: {
      classroomStudent: true,
    },
    orderBy: (table, operators) => [operators.desc(table.createdAt)],
    limit: 100,
  });

  return {
    success: true as const,
    data: interactions.map((interaction) => ({
      id: interaction.id,
      createdAt: interaction.createdAt,
      role: interaction.role,
      interactionType: interaction.interactionType,
      content: interaction.content,
      metadata: interaction.metadata,
      student: {
        id: interaction.classroomStudent.id,
        fullName: interaction.classroomStudent.fullName,
        email: interaction.classroomStudent.email,
      },
    })),
  };
}

export async function getLessonMaterialsData(
  lessonId: string,
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  const lesson = await getTeacherLessonAccess(session.user.id, lessonId);

  if (!lesson) {
    throw new Error("Unauthorized");
  }

  return {
    success: true as const,
    data: (await getDb().query.lessonMaterials.findMany({
      where: and(
        eq(lessonMaterials.lessonId, lessonId),
        ne(lessonMaterials.extractionStatus, "failed"),
        ne(lessonMaterials.indexingStatus, "failed"),
      ),
      orderBy: (table, operators) => [operators.desc(table.createdAt)],
    }))
      .filter((material) => !isMaterialAnalysisFailed(material.analysis))
      .map((material) => ({
        ...material,
        analysis: material.analysis ?? undefined,
      })),
  };
}

export async function getLessonReadinessData(lessonId: string) {
  const session = await getVerifiedSession();
  const access = await getTeacherLessonAccess(session.user.id, lessonId);

  if (!access) {
    throw new Error("Unauthorized");
  }

  const lesson = await getLessonWithMaterials(lessonId);
  if (!lesson) {
    throw new Error("Lesson not found");
  }

  try {
    const readiness = await getOrGenerateLessonReadiness(lesson);

    return {
      success: true as const,
      data: readiness.data,
      generatedAt: readiness.generatedAt,
      cacheStatus: readiness.cacheStatus,
    };
  } catch (error) {
    if (isReadinessQuotaError(error)) {
      return {
        success: true as const,
        data: buildReadinessUnavailableFallback(),
        generatedAt: null,
        cacheStatus: "unavailable" as const,
      };
    }

    throw error;
  }
}

