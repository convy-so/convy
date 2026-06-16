import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { getVerifiedSession } from "@/lib/auth/dal";
import { resolveTeacherClassroomAccess } from "@/lib/learning/teacher-route-access";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import { normalizeAppLocale } from "@/lib/i18n/config";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { classroomId } = await params;
    const accessResult = await resolveTeacherClassroomAccess({
      teacherUserId: session.user.id,
      classroomId,
    });

    if (accessResult.error === "UNAUTHORIZED") {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const { classroom } = accessResult;

    const topics = await getDb().query.learningTopics.findMany({
      where: (table, { eq }) => eq(table.classroomId, classroom.id),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: topics.map((topic) => ({
        ...topic,
        contentLocale: normalizeAppLocale(topic.contentLocale),
      })),
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to load topics", "/api/learning/classrooms/[classroomId]/topics");
  }
}
