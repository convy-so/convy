import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import {
  classroomStudents,
  learningInteractions,
  learningTopics,
  studentProgressReports,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getTeacherClassroomAccess } from "@/lib/learning/access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { studentId } = await params;

    const membership = await getDb().query.classroomStudents.findFirst({
      where: eq(classroomStudents.id, studentId),
      with: {
        classroom: true,
        interestProfile: true,
      },
    });

    if (!membership) {
      return apiError("NOT_FOUND", "Student not found");
    }

    const access = await getTeacherClassroomAccess(session.user.id, membership.classroomId);

    if (!access) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const [topics, reports, interactions] = await Promise.all([
      getDb().query.learningTopics.findMany({
        where: eq(learningTopics.classroomId, membership.classroomId),
        orderBy: (table, { asc }) => [asc(table.title)],
      }),
      getDb().query.studentProgressReports.findMany({
        where: eq(studentProgressReports.classroomStudentId, membership.id),
        with: {
          topic: true,
        },
        orderBy: (table, { desc: orderDesc }) => [orderDesc(table.updatedAt)],
        limit: 12,
      }),
      getDb().query.learningInteractions.findMany({
        where: eq(learningInteractions.classroomStudentId, membership.id),
        with: {
          topic: true,
        },
        orderBy: (table, { desc: orderDesc }) => [orderDesc(table.createdAt)],
        limit: 16,
      }),
    ]);

    const reportMap = new Map<string, (typeof reports)[number]>();
    for (const report of [...reports].reverse()) {
      reportMap.set(report.topicId, report);
    }
    const reportCountMap = reports.reduce<Record<string, number>>((acc, report) => {
      acc[report.topicId] = (acc[report.topicId] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
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
        topics: topics.map((topic) => {
          const latestReport = reportMap.get(topic.id);
          return {
            id: topic.id,
            title: topic.title,
            subject: topic.subject,
            contentLocale: topic.contentLocale,
            subjectKey: topic.subjectKey,
            subjectLabel: topic.subjectLabel,
            status: topic.status,
            reportCount: reportCountMap[topic.id] ?? 0,
            latestMasteryPercent: latestReport?.masteryPercent ?? null,
            latestReportAt: latestReport?.updatedAt?.toISOString() ?? null,
          };
        }),
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
        recentInteractions: interactions.map((interaction) => ({
          id: interaction.id,
          topicId: interaction.topicId,
          topicTitle: interaction.topic?.title ?? null,
          sessionId: interaction.sessionId,
          interactionType: interaction.interactionType,
          role: interaction.role,
          content: interaction.content,
          createdAt: interaction.createdAt,
        })),
      },
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to load student overview", "/api/learning/students/[studentId]/overview");
  }
}
