import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";

import { getDb } from "@/shared/db";
import { getVerifiedSession } from "@/features/auth/public-server";
import { resolveTeacherClassroomAccess } from "@/features/tutoring/server/teacher-route-access";
import { handleLearningRouteError } from "@/features/tutoring/server/route-errors";
import { normalizeAppLocale } from "@/shared/i18n/config";

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

    const lessons = await getDb().query.learningTopics.findMany({
      where: (table, { eq }) => eq(table.classroomId, classroom.id),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: lessons.map((lesson) => ({
        ...lesson,
        contentLocale: normalizeAppLocale(lesson.contentLocale),
      })),
    });
  } catch (error) {
    return handleLearningRouteError(error, "Failed to load lessons", "/api/learning/classrooms/[classroomId]/lessons");
  }
}
