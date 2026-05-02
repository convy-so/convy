import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { learningTeacherChatSessions } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getTeacherClassroomAccess } from "@/lib/learning/access";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string; sessionId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { studentId, sessionId } = await params;

    const membership = await getDb().query.classroomStudents.findFirst({
      where: (table, { eq }) => eq(table.id, studentId),
    });

    if (!membership) {
      return apiError("NOT_FOUND", "Student not found");
    }

    const access = await getTeacherClassroomAccess(
      session.user.id,
      membership.classroomId,
    );

    if (!access) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const [chatSession] = await getDb()
      .select({
        id: learningTeacherChatSessions.id,
        title: learningTeacherChatSessions.title,
        language: learningTeacherChatSessions.language,
        messages: learningTeacherChatSessions.messages,
        createdAt: learningTeacherChatSessions.createdAt,
        updatedAt: learningTeacherChatSessions.updatedAt,
      })
      .from(learningTeacherChatSessions)
      .where(
        and(
          eq(learningTeacherChatSessions.id, sessionId),
          eq(learningTeacherChatSessions.classroomStudentId, studentId),
          eq(learningTeacherChatSessions.userId, session.user.id),
        ),
      );

    if (!chatSession) {
      return apiError("NOT_FOUND", "Session not found");
    }

    return NextResponse.json({ session: chatSession });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return apiError("UNAUTHENTICATED", error.message);
    }
    return apiUnhandledError(error, "Internal server error", "/api/learning/students/[studentId]/chat-sessions/[sessionId]");
  }
}
