import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";

import { getDb } from "@/shared/db";
import { studentLessonReports } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getTeacherLessonAccess } from "@/features/tutoring/server/access";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";
import { buildClassroomLessonReportSummary } from "@/features/tutoring/server/reporting";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { lessonId } = await params;
    const lesson = await getTeacherLessonAccess(session.user.id, lessonId);

    if (!lesson) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const reports = await getDb().query.studentLessonReports.findMany({
      where: eq(studentLessonReports.lessonId, lessonId),
      with: {
        classroomStudent: true,
      },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
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

    return NextResponse.json({
      success: true,
      data: {
        reports: serializedReports,
        summary: buildClassroomLessonReportSummary(serializedReports),
      },
    });
  } catch (error) {
    return handleTutoringRouteError(error, "Failed to load reports", "/api/lessons/[lessonId]/reports");
  }
}

