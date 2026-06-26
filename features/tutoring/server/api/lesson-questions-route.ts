import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/shared/http/api-error";

import { getDb } from "@/shared/db";
import { studentInteractions } from "@/shared/db/schema";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getTeacherLessonAccess } from "@/features/tutoring/server/access";
import { handleTutoringRouteError } from "@/features/tutoring/server/route-errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { lessonId } = await params;
    const lesson = await getTeacherLessonAccess(session.user.id, lessonId);

    if (!lesson) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const url = new URL(request.url);
    const classroomStudentId =
      url.searchParams.get("classroomStudentId") ?? url.searchParams.get("studentId");

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
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 100,
    });

    return NextResponse.json({
      success: true,
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
    });
  } catch (error) {
    return handleTutoringRouteError(
      error,
      "Failed to load questions",
      "/api/lessons/[lessonId]/questions:get",
    );
  }
}

