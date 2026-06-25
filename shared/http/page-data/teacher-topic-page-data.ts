import { and, count, eq, isNull, ne } from "drizzle-orm";

import { getDb } from "@/shared/db";
import {
  classroomStudents,
  learningInteractions,
  studentProgressReports,
  topicMaterials,
} from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getTeacherTopicAccess } from "@/features/tutoring/server/access";
import { buildClassroomTopicReportSummary } from "@/features/tutoring/server/reporting";
import { getTopicWithMaterials } from "@/features/tutoring/public-server";
import { isMaterialAnalysisFailed } from "@/features/tutoring/server/materials-route-service";
import {
  buildReadinessUnavailableFallback,
  getOrGenerateTopicReadiness,
  isReadinessQuotaError,
} from "@/features/tutoring/server/readiness";
import { normalizeAppLocale, type AppLocale } from "@/shared/i18n/config";
import type { TopicOverviewResponse } from "@/features/tutoring/public-client";
import type { QueryAuthContext } from "@/shared/http/page-data/page-data-context";
import { resolveQuerySession } from "@/shared/http/page-data/page-data-context";

function toOptionalAppLocale(value: string | null | undefined): AppLocale | undefined {
  return value ? normalizeAppLocale(value) : undefined;
}

export async function getTopicOverviewData(topicId: string): Promise<TopicOverviewResponse> {
  const session = await getVerifiedSession();
  const topic = await getTeacherTopicAccess(session.user.id, topicId);

  if (!topic) {
    throw new Error("Unauthorized");
  }

  const [reportCountResult, questionCountResult, activeStudentCountResult] = await Promise.all([
    getDb()
      .select({ value: count() })
      .from(studentProgressReports)
      .where(eq(studentProgressReports.topicId, topicId)),
    getDb()
      .select({ value: count() })
      .from(learningInteractions)
      .where(
        and(
          eq(learningInteractions.topicId, topicId),
          isNull(learningInteractions.sessionId),
          eq(learningInteractions.interactionType, "out_of_session_question"),
        ),
      ),
    getDb()
      .select({ value: count() })
      .from(classroomStudents)
      .where(
        and(
          eq(classroomStudents.classroomId, topic.classroomId),
          eq(classroomStudents.inviteStatus, "accepted"),
        ),
      ),
  ]);

  return {
    success: true as const,
    data: {
      topic: {
        id: topic.id,
        title: topic.title,
        description: topic.description,
        courseId: topic.courseId,
        courseTitle: topic.course.title,
        contentLocale: toOptionalAppLocale(topic.contentLocale),
        status: topic.status,
        classroom: {
          id: topic.classroom.id,
          title: topic.classroom.title,
          gradeBand: topic.classroom.gradeBand,
          gradeLabel: topic.classroom.gradeLabel,
        },
      },
      reportCount: reportCountResult[0]?.value ?? 0,
      questionCount: questionCountResult[0]?.value ?? 0,
      activeStudentCount: activeStudentCountResult[0]?.value ?? 0,
    },
  };
}

export async function getTopicSetupData(topicId: string) {
  const session = await getVerifiedSession();
  const topic = await getTeacherTopicAccess(session.user.id, topicId);

  if (!topic) {
    throw new Error("Unauthorized");
  }

  return {
    success: true as const,
    data: {
      topic: {
        id: topic.id,
        classroomId: topic.classroomId,
        title: topic.title,
        description: topic.description ?? "",
        courseId: topic.courseId,
        courseTitle: topic.course.title,
        contentLocale: toOptionalAppLocale(topic.contentLocale) ?? "en",
        status: topic.status,
        learningOutcomes: topic.learningOutcomes,
        sourceBoundary: topic.sourceBoundary,
      },
      classroom: {
        id: topic.classroom.id,
        title: topic.classroom.title,
      },
    },
  };
}

export async function getTopicReportsData(
  topicId: string,
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  const topic = await getTeacherTopicAccess(session.user.id, topicId);

  if (!topic) {
    throw new Error("Unauthorized");
  }

  const reports = await getDb().query.studentProgressReports.findMany({
    where: eq(studentProgressReports.topicId, topicId),
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
      summary: buildClassroomTopicReportSummary(serializedReports),
    },
  };
}

export async function getTopicQuestionsData(
  topicId: string,
  classroomStudentId?: string,
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  const topic = await getTeacherTopicAccess(session.user.id, topicId);

  if (!topic) {
    throw new Error("Unauthorized");
  }

  const interactions = await getDb().query.learningInteractions.findMany({
    where: classroomStudentId
      ? and(
          eq(learningInteractions.topicId, topicId),
          isNull(learningInteractions.sessionId),
          eq(learningInteractions.classroomStudentId, classroomStudentId),
        )
      : and(
          eq(learningInteractions.topicId, topicId),
          isNull(learningInteractions.sessionId),
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

export async function getTopicMaterialsData(
  topicId: string,
  authContext?: QueryAuthContext,
) {
  const session = await resolveQuerySession(authContext);
  const topic = await getTeacherTopicAccess(session.user.id, topicId);

  if (!topic) {
    throw new Error("Unauthorized");
  }

  return {
    success: true as const,
    data: (await getDb().query.topicMaterials.findMany({
      where: and(
        eq(topicMaterials.topicId, topicId),
        ne(topicMaterials.extractionStatus, "failed"),
        ne(topicMaterials.indexingStatus, "failed"),
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

export async function getTopicReadinessData(topicId: string) {
  const session = await getVerifiedSession();
  const access = await getTeacherTopicAccess(session.user.id, topicId);

  if (!access) {
    throw new Error("Unauthorized");
  }

  const topic = await getTopicWithMaterials(topicId);
  if (!topic) {
    throw new Error("Topic not found");
  }

  try {
    const readiness = await getOrGenerateTopicReadiness(topic);

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
