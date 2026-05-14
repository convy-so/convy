import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { learningTeacherChatSessions } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { resolveTeacherStudentAccess } from "@/lib/learning/teacher-route-access";
import { handleLearningRouteError } from "@/lib/learning/route-errors";
import { mapSessionAuthError } from "@/lib/route-auth-error";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { studentId } = await params;

    const accessResult = await resolveTeacherStudentAccess({
      teacherUserId: session.user.id,
      classroomStudentId: studentId,
    });

    if (accessResult.error === "NOT_FOUND") {
      return apiError("NOT_FOUND", "Student not found");
    }

    if (accessResult.error === "UNAUTHORIZED") {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const sessions = await getDb()
      .select({
        id: learningTeacherChatSessions.id,
        title: learningTeacherChatSessions.title,
        language: learningTeacherChatSessions.language,
        createdAt: learningTeacherChatSessions.createdAt,
        updatedAt: learningTeacherChatSessions.updatedAt,
      })
      .from(learningTeacherChatSessions)
      .where(
        and(
          eq(learningTeacherChatSessions.classroomStudentId, studentId),
          eq(learningTeacherChatSessions.userId, session.user.id),
        ),
      )
      .orderBy(desc(learningTeacherChatSessions.updatedAt));

    return NextResponse.json({ sessions });
  } catch (error) {
    const authError = mapSessionAuthError(error);
    if (authError) return authError;
    return handleLearningRouteError(error, "Internal server error", "/api/learning/students/[studentId]/chat-sessions");
  }
}
