import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { studentProgressReports } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getTeacherTopicAccess } from "@/lib/learning/access";
import { buildClassroomTopicReportSummary } from "@/lib/learning/reporting";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const topic = await getTeacherTopicAccess(session.user.id, topicId);

    if (!topic) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const reports = await getDb().query.studentProgressReports.findMany({
      where: eq(studentProgressReports.topicId, topicId),
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
        summary: buildClassroomTopicReportSummary(serializedReports),
      },
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to load reports", "/api/learning/topics/[topicId]/reports");
  }
}
